// Test-only: photo files for the T-012 / R-005 interface tests, made at run time so nothing big is committed.
// Real images come from a canvas in Chromium (jpeg/png/webp); the odd ones (noise, fake, gif, broken, EXIF) are built here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { Locator, Page } from '@playwright/test';
import { adminClient, PHOTO_BUCKET } from './supabase-admin';

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Draws a test pattern on a canvas in the page and returns the encoded bytes. */
export async function canvasImage(
  page: Page,
  name: string,
  width: number,
  height: number,
  type: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<UploadFile> {
  const b64 = await page.evaluate(
    async ([w, h, t]) => {
      const c = document.createElement('canvas');
      c.width = w as number;
      c.height = h as number;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, w as number, h as number);
      g.addColorStop(0, '#c0392b');
      g.addColorStop(1, '#2980b9');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w as number, h as number);
      ctx.fillStyle = '#fff';
      ctx.fillRect(10, 10, 40, 20);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), t as string, 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [width, height, type] as const,
  );
  return { name, mimeType: type, buffer: Buffer.from(b64, 'base64') };
}

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Random-pixel RGB PNG: cannot be compressed, so it forces the quality/size ladder (crit. 3). */
export function noisePng(size = 1280): UploadFile {
  const row = size * 3 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let i = 1; i < row; i++) raw[y * row + i] = Math.floor(Math.random() * 256);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name: 'noise.png', mimeType: 'image/png', buffer: png };
}

/** Text with a .jpg name: wrong content (crit. 2). */
export const fakeJpg = (): UploadFile => ({ name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('Dit is gewoon tekst, geen foto.\n') });

export const animGif = (): UploadFile => ({
  name: 'anim.gif',
  mimeType: 'image/gif',
  buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
});

/** Right PNG signature, rubbish after it: the type check passes, decoding fails (crit. 2). */
export const brokenPng = (): UploadFile => ({
  name: 'broken.png',
  mimeType: 'image/png',
  buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a png at all'.repeat(4))]),
});

/** A committed real HEIC file (crit. 2). A missing file fails the test: a skipped test is no coverage. */
export const HEIC_PATH = join('tests', 'fixtures', 'photos', 'photo.heic');
export const heicFixture = (): UploadFile => {
  if (!existsSync(HEIC_PATH)) throw new Error(`${HEIC_PATH} is missing: commit a small real HEIC file`);
  return { name: 'photo.heic', mimeType: 'image/heic', buffer: readFileSync(HEIC_PATH) };
};

/** Adds an EXIF Orientation tag to a JPEG (6 = rotate 90 degrees clockwise), dropping a JFIF header if present. */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00,
    orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  let rest = jpeg.subarray(2);
  if (rest[0] === 0xff && rest[1] === 0xe0) rest = rest.subarray(2 + ((rest[2] << 8) | rest[3]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment, rest]);
}

/** Reads width and height from the first SOF marker of a JPEG; null when it is not a JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

/** Downloads a stored photo with the service client. */
export async function downloadPhoto(path: string): Promise<Uint8Array> {
  const res = await adminClient().storage.from(PHOTO_BUCKET).download(path);
  if (res.error || !res.data) throw res.error ?? new Error(`download failed: ${path}`);
  return new Uint8Array(await res.data.arrayBuffer());
}

export interface StoredPhoto {
  path: string;
  main: boolean;
}

export async function photosOf(recipeId: string): Promise<StoredPhoto[]> {
  const res = await adminClient().from('recipes').select('photos').eq('id', recipeId).single();
  if (res.error) throw res.error;
  return (res.data?.photos ?? []) as StoredPhoto[];
}

export const recipeIdFromUrl = (url: string): string => {
  const m = /\/recept\/([0-9a-f-]{36})/.exec(url);
  if (!m) throw new Error(`no recipe id in ${url}`);
  return m[1];
};

// --- locators on the photo group of the recipe form (names fixed by the brief) ---

export const photoGroup = (page: Page): Locator => page.getByRole('group', { name: "Foto's", exact: true });
export const cameraButton = (page: Page): Locator => photoGroup(page).getByRole('button', { name: 'Foto nemen', exact: true });
export const galleryButton = (page: Page): Locator => photoGroup(page).getByRole('button', { name: 'Kies uit galerij', exact: true });
export const cameraInput = (page: Page): Locator => photoGroup(page).locator('input[type="file"][capture]');
export const galleryInput = (page: Page): Locator => photoGroup(page).locator('input[type="file"]:not([capture])');
export const photoRemoveButtons = (page: Page): Locator => photoGroup(page).getByRole('button', { name: /^Foto \d+ verwijderen$/ });
export const photoError = (page: Page): Locator => photoGroup(page).getByRole('alert');
export const photoRemove = (page: Page, n: number): Locator => photoGroup(page).getByRole('button', { name: `Foto ${n} verwijderen`, exact: true });
export const photoUp = (page: Page, n: number): Locator => photoGroup(page).getByRole('button', { name: `Foto ${n} omhoog`, exact: true });
export const photoDown = (page: Page, n: number): Locator => photoGroup(page).getByRole('button', { name: `Foto ${n} omlaag`, exact: true });
export const photoMain = (page: Page, n: number): Locator => photoGroup(page).getByRole('button', { name: `Foto ${n} als hoofdfoto`, exact: true });

export const TOO_MANY = "Maximaal 3 foto's.";
export const NOT_A_PHOTO = 'Dit bestand is geen foto. Kies een JPEG, PNG, WebP of HEIC.';
