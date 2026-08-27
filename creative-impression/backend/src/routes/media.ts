import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isHttpError } from '@/utils/helpers';

const router = Router();

router.use(authMiddleware, adminOnly);

/**
 * Where uploads live on disk.
 *
 * Outside `src` so a rebuild never touches them, and outside the frontend's
 * `public/` because that directory is baked at build time — a file dropped
 * there after a deploy would not be served. Express serves this directory
 * directly (see index.ts).
 */
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/** Matches the express.static mount. */
const PUBLIC_PREFIX = '/uploads';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Uploads are held in memory rather than written straight to disk: nothing is
 * persisted until sharp confirms the bytes really are an image and re-encodes
 * them, so a file that lies about its type never reaches the filesystem.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** The largest dimension we keep. Anything bigger is a photo straight off a phone. */
const MAX_EDGE = 2400;

interface StoredImage {
  hash: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Normalises and stores one upload.
 *
 * Everything becomes webp: it saves the storefront from serving whatever mix of
 * formats people happen to have, and it means the extension in the URL is
 * always true. The filename is the hash of the encoded bytes, so re-uploading
 * the same picture reuses the existing file instead of filling the disk with
 * copies, and the URL can be cached indefinitely because its content can never
 * change.
 */
async function storeImage(buffer: Buffer): Promise<StoredImage> {
  const image = sharp(buffer, { failOn: 'error' });
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    throw Object.assign(new Error('That file is not an image.'), { statusCode: 400 });
  }

  const encoded = await image
    .rotate() // honour EXIF orientation before it is stripped
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const hash = createHash('sha256').update(encoded.data).digest('hex').slice(0, 32);
  const filename = `${hash}.webp`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const target = path.join(UPLOAD_DIR, filename);

  // Same bytes, same name: if it is already there the write is redundant.
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, encoded.data);
  }

  return {
    hash,
    url: `${PUBLIC_PREFIX}/${filename}`,
    width: encoded.info.width,
    height: encoded.info.height,
    bytes: encoded.data.length,
  };
}

const toAsset = (row: {
  id: string;
  url: string;
  filename: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: Date;
}) => ({
  id: row.id,
  url: row.url,
  filename: row.filename,
  alt: row.alt,
  width: row.width,
  height: row.height,
  bytes: row.bytes,
  createdAt: row.createdAt,
});

/**
 * @route   GET /api/admin/media
 * @desc    The image library, newest first
 * @access  Admin
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const rows = await prisma.mediaAsset.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, message: 'Media fetched', data: { assets: rows.map(toAsset) } });
  } catch (error) {
    console.error('[ADMIN] media list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to list media' });
  }
});

/**
 * @route   POST /api/admin/media
 * @desc    Upload one image
 * @access  Admin
 */
router.post('/', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file was uploaded.' });
      return;
    }

    const stored = await storeImage(req.file.buffer);

    // The original name is kept only as a label. It never touches the path:
    // the filename on disk is derived from the hash.
    const filename = path.basename(req.file.originalname || 'upload').slice(0, 120);
    const alt = typeof req.body?.alt === 'string' ? req.body.alt.slice(0, 300) : '';

    // Same bytes as an existing asset: reuse the row rather than creating a
    // duplicate that points at the same file.
    const asset = await prisma.mediaAsset.upsert({
      where: { hash: stored.hash },
      update: {},
      create: {
        hash: stored.hash,
        url: stored.url,
        filename,
        alt,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        uploadedById: req.user?.id ?? null,
      },
    });

    res.status(201).json({ success: true, message: 'Image uploaded', data: { asset: toAsset(asset) } });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    // sharp throws on anything it cannot decode, which is the common case here:
    // a PDF or a text file renamed to .jpg.
    if (error instanceof Error && /unsupported image|Input buffer/i.test(error.message)) {
      res.status(400).json({ success: false, message: 'That file is not an image we can read.' });
      return;
    }
    console.error('[ADMIN] media upload failed:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

/**
 * @route   PATCH /api/admin/media/:id
 * @desc    Edit an asset's alt text
 * @access  Admin
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const alt = typeof req.body?.alt === 'string' ? req.body.alt.slice(0, 300) : '';
    const asset = await prisma.mediaAsset.update({ where: { id: req.params.id }, data: { alt } });
    res.json({ success: true, message: 'Media updated', data: { asset: toAsset(asset) } });
  } catch (error) {
    console.error('[ADMIN] media update failed:', error);
    res.status(404).json({ success: false, message: 'That image no longer exists.' });
  }
});

/**
 * @route   DELETE /api/admin/media/:id
 * @desc    Remove an asset and its file
 * @access  Admin
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) {
      res.status(404).json({ success: false, message: 'That image no longer exists.' });
      return;
    }

    await prisma.mediaAsset.delete({ where: { id: asset.id } });

    // The row is the record, so it goes first. A file left behind is wasted
    // disk; a row pointing at a deleted file is a broken image on the
    // storefront, which is worse.
    try {
      await fs.unlink(path.join(UPLOAD_DIR, `${asset.hash}.webp`));
    } catch (error) {
      console.warn('[ADMIN] media file could not be removed:', error);
    }

    res.json({ success: true, message: 'Image deleted', data: { id: asset.id } });
  } catch (error) {
    console.error('[ADMIN] media delete failed:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

export default router;
