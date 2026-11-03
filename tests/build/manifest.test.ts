import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = 'dist';
const built = existsSync(join(dist, 'manifest.webmanifest'));

interface Icon {
  src: string;
  sizes: string;
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

  it('has name, display and start_url', () => {
    expect(manifest.name).toBe('Smaakmaker');
    expect(manifest.display).toBe('standalone');
    expect(String(manifest.start_url ?? '')).not.toBe('');
  });

  it.each([192, 512])('has a real %i px icon in dist/', (size) => {
    const icon = (manifest.icons as Icon[]).find((i) => i.sizes === `${size}x${size}`);
    expect(icon, `icon ${size}x${size}`).toBeDefined();
    const file = join(dist, icon!.src.replace(/^\.?\//, ''));
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual({ w: size, h: size });
  });
});
