import { describe, expect, it } from 'vitest';
import { detectImageType } from '../../src/lib/photoType';

// T-012 / R-005 crit. 2: the type comes from the first bytes, never from the file name or file.type.
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const pad = (bytes: number[], to = 64): Uint8Array => {
  const out = new Uint8Array(Math.max(to, bytes.length));
  out.set(bytes);
  return out;
};
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** ISO-BMFF `ftyp` box: size, 'ftyp', major brand, minor version, compatible brands. */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const body = [...ascii('ftyp'), ...ascii(major), ...u32(0), ...compatible.flatMap(ascii)];
  return pad([...u32(body.length + 4), ...body]);
}

describe('detectImageType (crit. 2)', () => {
  it('recognises JPEG by FF D8 FF', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
  });

  it('recognises PNG by its 8-byte signature', () => {
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });

  it('refuses a PNG signature that is cut short', () => {
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))).toBeNull();
  });

  it('recognises WebP as RIFF????WEBP, whatever the size bytes are', () => {
    expect(detectImageType(pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]))).toBe('webp');
  });

  it('refuses RIFF that is not WebP (e.g. WAV)', () => {
    expect(detectImageType(pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]))).toBeNull();
  });

  for (const brand of ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']) {
    it(`recognises HEIC with major brand ${brand}`, () => {
      expect(detectImageType(ftyp(brand))).toBe('heic');
    });
  }

  for (const major of ['mif1', 'msf1']) {
    it(`recognises ${major} with a HEIC brand among the compatible brands`, () => {
      expect(detectImageType(ftyp(major, ['mif1', 'heic']))).toBe('heic');
    });

    it(`refuses ${major} without a HEIC brand (AVIF-style still image)`, () => {
      expect(detectImageType(ftyp(major, ['mif1', 'miaf']))).toBeNull();
    });
  }

  it('refuses AVIF (ftypavif)', () => {
    expect(detectImageType(ftyp('avif'))).toBeNull();
  });

  it('refuses GIF, PDF, plain text and an empty buffer', () => {
    expect(detectImageType(pad(ascii('GIF89a')))).toBeNull();
    expect(detectImageType(pad(ascii('%PDF-1.7')))).toBeNull();
    expect(detectImageType(pad(ascii('Dit is gewoon tekst, geen foto.')))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });

  it('refuses text that is saved as foto.jpg: only the content counts', () => {
    // The function only gets bytes, so a name cannot influence it; this pins that the text content wins.
    expect(detectImageType(new TextEncoder().encode('hallo, ik ben geen jpeg'))).toBeNull();
  });

  it('does not throw on buffers shorter than any signature', () => {
    expect(detectImageType(new Uint8Array([0xff]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
