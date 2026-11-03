// Converts a chosen photo to a JPEG of at most 1280 px and 512.000 bytes on the device, before upload
// (R-005 crit. 3). Less data over the mobile network; the bucket enforces the same limits.

import { detectImageType } from './photoType';

export const PHOTO_MAX_SIDE = 1280;
export const PHOTO_MAX_BYTES = 512_000;

/** Quality steps at full size; after the last one the size shrinks instead. */
const QUALITIES = [0.85, 0.75, 0.65, 0.55];
const SHRINK = 0.85;
/** Own limit so the ladder always ends, even for an image that never gets small enough. */
const MAX_ATTEMPTS = 12;

/** Longest side at most `max`, aspect ratio kept, never enlarged, at least 1 px. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const factor = max / longest;
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

export interface Attempt {
  quality: number;
  scale: number;
}

/**
 * The step after an attempt that was still too big: quality 0.85 -> 0.75 -> 0.65 -> 0.55, then the size
 * x 0.85 each time at the lowest quality. Null when the ladder is used up.
 */
export function nextAttempt(quality: number, scale: number): Attempt | null {
  const index = QUALITIES.findIndex((q) => Math.abs(q - quality) < 1e-6);
  if (index >= 0 && index < QUALITIES.length - 1) return { quality: QUALITIES[index + 1], scale };
  const next = scale * SHRINK;
  // Number of shrink steps taken so far, from the scale.
  const shrinks = Math.round(Math.log(next) / Math.log(SHRINK));
  if (QUALITIES.length - 1 + shrinks >= MAX_ATTEMPTS) return null;
  return { quality: QUALITIES[QUALITIES.length - 1], scale: next };
}

export type PhotoErrorKind = 'notAPhoto' | 'processFailed';

export class PhotoError extends Error {
  constructor(readonly kind: PhotoErrorKind) {
    super(kind);
  }
}

const canvasBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

async function decode(file: Blob): Promise<ImageBitmap> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const type = detectImageType(head);
  if (!type) throw new PhotoError('notAPhoto');
  try {
    if (type === 'heic') {
      // Loaded only for a HEIC file: the decoder is large and most photos never need it.
      const { heicTo } = await import('heic-to');
      return await heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
    }
    // from-image applies the EXIF rotation; the canvas drops EXIF, so it must be applied here.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // The signature was right but the content cannot be decoded.
    throw new PhotoError('notAPhoto');
  }
}

/** Throws a PhotoError: `notAPhoto` (wrong type or undecodable) or `processFailed` (no small enough result). */
export async function toJpeg(file: Blob): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    const base = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
    // Transparency becomes the page background token, not a literal colour.
    const background = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || 'white';
    let attempt: Attempt | null = { quality: QUALITIES[0], scale: 1 };
    while (attempt) {
      const width = Math.max(1, Math.round(base.width * attempt.scale));
      const height = Math.max(1, Math.round(base.height * attempt.scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new PhotoError('processFailed');
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasBlob(canvas, attempt.quality);
      if (blob && blob.type === 'image/jpeg' && blob.size <= PHOTO_MAX_BYTES) return blob;
      attempt = nextAttempt(attempt.quality, attempt.scale);
    }
    throw new PhotoError('processFailed');
  } finally {
    bitmap.close();
  }
}
