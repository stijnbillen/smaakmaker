import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = 'dist';
const built = existsSync(join(dist, 'sw.js'));

// T-012 / R-005 crit. 2 (review finding 2): the ~3 MB HEIC decoder is loaded on first use, online,
// and must stay out of the service worker precache so installing the app stays small.
describe('precache (R-005 HEIC decoder)', () => {
  it('dist/ is built (run `npm run build` first)', () => {
    expect(built).toBe(true);
  });

  const sw = built ? readFileSync(join(dist, 'sw.js'), 'utf8') : '';
  const assets = built && existsSync(join(dist, 'assets')) ? readdirSync(join(dist, 'assets')) : [];
  const heicChunks = assets.filter((f) => /^heic-to-.*\.js$/.test(f));

  it('the HEIC decoder is a separate chunk (lazy import)', () => {
    expect(heicChunks.length).toBeGreaterThanOrEqual(1);
  });

  it('the HEIC chunk is not in the precache list', () => {
    for (const chunk of heicChunks) expect(sw).not.toContain(chunk);
  });

  it('the app shell is still precached', () => {
    expect(sw).toMatch(/index-[\w-]+\.js/);
  });
});
