/**
 * POST /api/custom-wear/quotes
 *
 * Accepts a Custom Wear quote request, validates it and issues the reference
 * number SERVER-SIDE (never in the browser).
 *
 * When `CUSTOM_WEAR_QUOTE_API` is set, the request is forwarded to that
 * endpoint and its reference is returned, so the database owns the sequence.
 * Until then the handler issues a provisional reference and returns
 * `persisted: false`, which the UI states plainly rather than pretending the
 * request was stored.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const quoteSchema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  colorId: z.string().nullable(),
  colorName: z.string().nullable(),
  sizes: z.array(z.string()).max(20),
  quantity: z.number().int().positive().max(1_000_000),
  method: z.string().nullable(),
  locations: z.array(z.string()).max(8),
  designFileNames: z.array(z.string().max(255)).max(10),
  notes: z.string().max(4000),

  customerName: z.string().min(1).max(120),
  company: z.string().max(160),
  email: z.string().email(),
  phone: z.string().max(32),
  country: z.string().min(1).max(80),
  postcode: z.string().max(20),
  requiredBy: z.string().max(40),
});

/**
 * Provisional reference used only while no quote backend is configured.
 * Format matches the production scheme: CWQ-<year>-<6 digits>.
 */
function issueProvisionalReference(): string {
  const year = new Date().getFullYear();
  const sequence = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `CWQ-${year}-${sequence}`;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Could not read the request body.' },
      { status: 400 }
    );
  }

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: 'Some details are missing or invalid. Please check the form and try again.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 }
    );
  }

  const receivedAt = new Date().toISOString();
  const quoteApi = process.env.CUSTOM_WEAR_QUOTE_API;

  if (quoteApi) {
    try {
      const upstream = await fetch(quoteApi, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.CUSTOM_WEAR_QUOTE_API_KEY
            ? { Authorization: `Bearer ${process.env.CUSTOM_WEAR_QUOTE_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({ ...parsed.data, receivedAt }),
      });

      if (!upstream.ok) {
        return NextResponse.json(
          { message: 'The quote service rejected this request. Please try again shortly.' },
          { status: 502 }
        );
      }

      const result = (await upstream.json()) as { reference?: string };
      if (!result.reference) {
        return NextResponse.json(
          { message: 'The quote service did not return a reference number.' },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { reference: result.reference, persisted: true, receivedAt },
        { status: 201 }
      );
    } catch {
      return NextResponse.json(
        { message: 'We could not reach the quote service. Please try again shortly.' },
        { status: 503 }
      );
    }
  }

  // No quote backend configured: log it so the request is not silently lost.
  const reference = issueProvisionalReference();
  console.info('[custom-wear] quote request received (not persisted)', {
    reference,
    receivedAt,
    product: parsed.data.sku,
    quantity: parsed.data.quantity,
    email: parsed.data.email,
  });

  return NextResponse.json({ reference, persisted: false, receivedAt }, { status: 202 });
}
