// Image type from the first bytes. The file name and file.type are not trusted: a text file named
// foto.jpg must be refused (R-005 crit. 2).

export type ImageType = 'jpeg' | 'png' | 'webp' | 'heic';

const ascii = (bytes: Uint8Array, start: number, length: number): string => {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Brands that mean HEIC. AVIF (avif, avis) is deliberately not among them. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
/** Generic still-image brands: HEIC only when a HEIC brand is among the compatible brands. */
const GENERIC_BRANDS = new Set(['mif1', 'msf1']);

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const major = ascii(bytes, 8, 4);
  if (HEIC_BRANDS.has(major)) return true;
  if (!GENERIC_BRANDS.has(major)) return false;
  // Box size is a big-endian u32; compatible brands start after the 4-byte minor version.
  const size = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(size, bytes.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    if (HEIC_BRANDS.has(ascii(bytes, i, 4))) return true;
  }
  return false;
}

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, PNG)) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (isHeic(bytes)) return 'heic';
  return null;
}
