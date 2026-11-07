import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = 'dist';
const built = existsSync(join(dist, 'manifest.webmanifest'));

interface Icon {
  src: string;
  sizes: string;
  purpose?: string;
}

function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  // PNG signature, then IHDR: width at byte 16, height at byte 20 (big endian)
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// T-001 criterion 2
describe('web app manifest (R-001 crit. 2)', () => {
  // Fails (not skips) without a build: the loop always runs `npm run build` first.
  it('dist/ is built (run `npm run build` first)', () => {
    expect(built).toBe(true);
  });

  const manifest = built ? JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) : {};
  const icons = (manifest.icons ?? []) as Icon[];

  it('has name, display and start_url', () => {
    expect(manifest.name).toBe('Smaakmaker');
    expect(manifest.display).toBe('standalone');
    expect(String(manifest.start_url ?? '')).not.toBe('');
  });

  // T-026 crit. 7 (R-025): name stays Smaakmaker
  it('short_name stays Smaakmaker (R-025)', () => {
    expect(manifest.short_name).toBe('Smaakmaker');
  });

  // T-026 crit. 4 (R-025): purpose any (192, 512) and maskable (512), files exist with exact size
  it.each([
    [192, 'any'],
    [512, 'any'],
    [512, 'maskable'],
  ] as const)('has a real %i px icon with purpose %s in dist/ (R-025 crit. 4)', (size, purpose) => {
    const icon = icons.find((i) => i.sizes === `${size}x${size}` && (i.purpose ?? 'any').split(/\s+/).includes(purpose));
    expect(icon, `icon ${size}x${size} ${purpose}`).toBeDefined();
    const file = join(dist, icon!.src.replace(/^\.?\//, ''));
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual({ w: size, h: size });
  });

  it('the maskable icon is a separate file from the any icon of the same size', () => {
    const any512 = icons.find((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any');
    const mask512 = icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable');
    expect(any512 && mask512).toBeTruthy();
    expect(any512!.src).not.toBe(mask512!.src);
  });

  it('dist/ contains the favicon, apple-touch-icon and SVG icon', () => {
    for (const f of ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png']) {
      expect(existsSync(join(dist, 'icons', f)), f).toBe(true);
    }
  });
});
