import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { HttpError } from '@/utils/helpers';

/**
 * Storage for files that must never be publicly reachable: seller KYC
 * documents (PAN card, GST certificate, cancelled cheque).
 *
 * They live outside `uploads/`, which Express serves statically, and are only
 * streamed back through routes that check who is asking. File names are the
 * content hash, so a stored name carries nothing guessable or user-supplied.
 *
 * The type is decided from the bytes, not the extension or the MIME type the
 * browser claimed (the idea comes from IXImpression's `core/file-signature.js`).
 * Images are re-encoded by sharp, which also strips EXIF data such as GPS
 * location. PDFs are kept as-is after their signature is checked.
 */

export const PRIVATE_DIR = path.resolve(process.cwd(), 'private-uploads');

const NAME_RE = /^[a-f0-9]{32}\.(webp|pdf)$/;

export const isPrivateFileName = (name: string): boolean => NAME_RE.test(name);

function vendorDir(vendorId: string): string {
  // Ids are cuids; refuse anything else rather than trusting it in a path.
  if (!/^[a-z0-9]+$/i.test(vendorId)) throw new HttpError(400, 'Invalid seller id');
  return path.join(PRIVATE_DIR, 'kyc', vendorId);
}

export async function storeKycDocument(vendorId: string, buffer: Buffer): Promise<string> {
  let bytes: Buffer;
  let ext: 'webp' | 'pdf';

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    bytes = buffer;
    ext = 'pdf';
  } else {
    try {
      const image = sharp(buffer, { failOn: 'error' });
      const meta = await image.metadata();
      if (!meta.width || !meta.height) throw new Error('not an image');
      bytes = await image
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      ext = 'webp';
    } catch {
      throw new HttpError(400, 'Upload a PDF or a photo (JPG, PNG or WebP)');
    }
  }

  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
  const dir = vendorDir(vendorId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), bytes);
  return name;
}

export async function readKycDocument(
  vendorId: string,
  name: string
): Promise<{ bytes: Buffer; contentType: string }> {
  if (!isPrivateFileName(name)) throw new HttpError(404, 'Document not found');
  try {
    const bytes = await fs.readFile(path.join(vendorDir(vendorId), name));
    return { bytes, contentType: name.endsWith('.pdf') ? 'application/pdf' : 'image/webp' };
  } catch {
    throw new HttpError(404, 'Document not found');
  }
}

export async function deleteKycDocument(vendorId: string, name: string): Promise<void> {
  if (!isPrivateFileName(name)) return;
  await fs.rm(path.join(vendorDir(vendorId), name), { force: true });
}
