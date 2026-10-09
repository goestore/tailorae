'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import {
  deleteKycDocument,
  fetchKycDocument,
  getSellerKyc,
  submitKyc,
  uploadKycDocument,
  type KycStatus,
  type SellerKyc,
} from '@/lib/seller-api';
import { RootState } from '@/store';

/**
 * A seller's identity check (KYC).
 *
 * The marketplace pays out to whoever signs up, so before a shop goes live the
 * seller gives a PAN, a GSTIN if registered, and a document that backs them
 * up. The server checks the numbers' format and checksum and that the GSTIN
 * belongs to the PAN. The same checks run here first, so typos are caught
 * before the round trip. Documents are private: they never get a public URL,
 * and opening one fetches it with the seller's own token.
 */

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Mirrors `gstinCheckChar` in the backend's utils/kyc.ts. */
function gstinChecksumOk(gstin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = BASE36.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] === gstin[14];
}

const clean = (value: string): string => value.replace(/\s+/g, '').toUpperCase();

const STATUS_COPY: Record<KycStatus, { label: string; body: string }> = {
  NOT_SUBMITTED: {
    label: 'Not started',
    body: 'Fill in your details and upload at least one document, then submit.',
  },
  PENDING: {
    label: 'In review',
    body: 'We have your details and are checking them. This usually takes one working day. You can still add or replace documents.',
  },
  REJECTED: {
    label: 'Needs changes',
    body: 'Fix what is described below and submit again.',
  },
  APPROVED: {
    label: 'Verified',
    body: 'Your business is verified. To change these details, contact support.',
  },
};

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

export default function SellerVerificationPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const fileInput = useRef<HTMLInputElement>(null);

  const [kyc, setKyc] = useState<SellerKyc | null>(null);
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/verification');
  }, [isInitialized, user, router]);

  const load = useCallback(
    () =>
      getSellerKyc()
        .then((data) => {
          setKyc(data);
          setPan(data.pan ?? '');
          setGstin(data.gstin ?? '');
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const locked = kyc?.status === 'APPROVED';
  const panValue = clean(pan);
  const gstinValue = clean(gstin);
  const panError = panValue && !PAN_PATTERN.test(panValue) ? 'A PAN looks like ABCDE1234F.' : null;
  const gstinError = !gstinValue
    ? null
    : !GSTIN_PATTERN.test(gstinValue) || !gstinChecksumOk(gstinValue)
      ? 'That GSTIN is not valid. Check each character.'
      : panValue && gstinValue.slice(2, 12) !== panValue
        ? 'This GSTIN belongs to a different PAN.'
        : null;

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !kyc) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That file is over 5 MB. Try a smaller scan or a photo.');
      return;
    }
    setIsUploading(true);
    try {
      const documents = await uploadKycDocument(file);
      setKyc({ ...kyc, documents });
      toast.success('Document uploaded.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const openDocument = async (name: string) => {
    // Opened before the fetch so popup blockers see it as a direct click.
    const tab = window.open('', '_blank');
    try {
      const blob = await fetchKycDocument(name);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      toast.error((err as Error).message);
    }
  };

  const removeDocument = async (name: string) => {
    if (!kyc) return;
    try {
      const documents = await deleteKycDocument(name);
      setKyc({ ...kyc, documents });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!kyc) return;
    if (!panValue) {
      toast.error('Enter your PAN.');
      return;
    }
    if (panError || gstinError) {
      toast.error(panError ?? gstinError ?? 'Check your details.');
      return;
    }
    if (kyc.documents.length === 0) {
      toast.error('Upload at least one document first.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitKyc({ pan: panValue, ...(gstinValue ? { gstin: gstinValue } : {}) });
      toast.success('Submitted. We will review it shortly.');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (!kyc) {
    return (
      <main className="section-y">
        <div className="container-max">
          {error && <p className="alert alert-error text-sm">{error}</p>}
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            You need a seller account before you can verify it.{' '}
            <Link href="/seller" className="underline underline-offset-2">
              Set one up
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const status = STATUS_COPY[kyc.status];

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Verification' },
          ]}
        />

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1
              className="m-0 text-ink"
              style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
            >
              Verify your business
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Shoppers buy with more confidence from verified sellers, and we need it to pay you.
            </p>
          </div>
          <Link href="/seller" className="btn btn-outline btn-sm">
            Back to dashboard
          </Link>
        </header>

        <div className="mt-8 flex max-w-[720px] flex-col gap-8">
          <div
            className="border px-4 py-3.5 text-[14px]"
            role="status"
            style={
              kyc.status === 'APPROVED'
                ? { borderColor: 'var(--border)', background: 'var(--surface-2)' }
                : kyc.status === 'REJECTED'
                  ? { borderColor: 'var(--sale)', background: 'var(--surface-2)' }
                  : { borderColor: 'var(--brand)', background: 'var(--brand-soft)' }
            }
          >
            <p className="m-0 font-semibold text-ink">Status: {status.label}</p>
            <p className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
              {status.body}
            </p>
            {kyc.status === 'REJECTED' && kyc.rejectionReason && (
              <p className="m-0 mt-2 text-ink">
                <strong>What to fix:</strong> {kyc.rejectionReason}
              </p>
            )}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-8">
            <section className="flex flex-col gap-4">
              <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                Tax details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="kyc-pan"
                  label="PAN *"
                  value={pan}
                  onChange={(event) => setPan(event.target.value.toUpperCase())}
                  maxLength={10}
                  autoComplete="off"
                  placeholder="ABCDE1234F"
                  disabled={locked}
                  error={panError ?? undefined}
                  helperText={panError ? undefined : 'The business PAN, or your own if you sell as an individual.'}
                />
                <Input
                  id="kyc-gstin"
                  label="GSTIN"
                  value={gstin}
                  onChange={(event) => setGstin(event.target.value.toUpperCase())}
                  maxLength={15}
                  autoComplete="off"
                  placeholder="27ABCDE1234F1Z5"
                  disabled={locked}
                  error={gstinError ?? undefined}
                  helperText={gstinError ? undefined : 'Optional if you are below the GST threshold.'}
                />
              </div>
            </section>

            <section className="flex flex-col gap-4 border-t border-line pt-8">
              <div>
                <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Documents
                </h2>
                <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  Your PAN card, and your GST certificate if you gave a GSTIN. A cancelled cheque helps
                  us confirm your bank account. PDF or photo, up to 5 MB each. Only our verification
                  team can see these.
                </p>
              </div>

              {kyc.documents.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
                  {kyc.documents.map((name, index) => (
                    <li
                      key={name}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                      style={{ background: 'var(--surface)' }}
                    >
                      <span className="text-[14px] text-ink">
                        Document {index + 1}{' '}
                        <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                          ({name.endsWith('.pdf') ? 'PDF' : 'Image'})
                        </span>
                      </span>
                      <span className="flex gap-4 text-[13px]">
                        <button
                          type="button"
                          onClick={() => openDocument(name)}
                          className="underline underline-offset-2 text-ink"
                        >
                          View
                        </button>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => removeDocument(name)}
                            className="underline underline-offset-2"
                            style={{ color: 'var(--ink-3)' }}
                            aria-label={`Remove document ${index + 1}`}
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  No documents yet.
                </p>
              )}

              {!locked && kyc.documents.length < kyc.maxDocuments && (
                <div>
                  <input
                    ref={fileInput}
                    id="kyc-file"
                    type="file"
                    accept={ACCEPTED}
                    onChange={onFile}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    loading={isUploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    Upload a document
                  </Button>
                </div>
              )}
            </section>

            {!locked && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
                <Button type="submit" size="lg" loading={isSubmitting}>
                  {kyc.status === 'PENDING' ? 'Update and resubmit' : 'Submit for review'}
                </Button>
                <p className="m-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  By submitting you confirm these documents are yours and accurate.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
