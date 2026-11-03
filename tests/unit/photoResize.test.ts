import { describe, expect, it } from 'vitest';
import { fitWithin, nextAttempt, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from '../../src/lib/photoResize';

// T-012 / R-005 crit. 3. The brief fixes names and numbers, not the result shapes:
// fitWithin returns { width, height } (or [w, h]); nextAttempt returns { quality, scale } or null when it gives up.
const dims = (r: unknown): [number, number] => {
  if (Array.isArray(r)) return [r[0], r[1]];
  const o = r as Record<string, number>;
  return [o.width ?? o.w, o.height ?? o.h];
};

describe('constants (crit. 3)', () => {
  it('are 1280 px and 512.000 bytes', () => {
    expect(PHOTO_MAX_SIDE).toBe(1280);
    expect(PHOTO_MAX_BYTES).toBe(512_000);
  });
});

describe('fitWithin (crit. 3: longest side <= 1280, never enlarged)', () => {
  const cases: Array<[number, number, [number, number]]> = [
    [4000, 3000, [1280, 960]],
    [3000, 4000, [960, 1280]],
    [1280, 1280, [1280, 1280]],
    [800, 600, [800, 600]], // smaller photo is not enlarged
    [1281, 1, [1280, 1]], // at least 1 px
    [1280, 960, [1280, 960]], // exactly on the limit stays
  ];
  for (const [w, h, expected] of cases) {
    it(`${w} x ${h} -> ${expected[0]} x ${expected[1]}`, () => {
      expect(dims(fitWithin(w, h, 1280))).toEqual(expected);
    });
  }

  it('keeps the aspect ratio within rounding for an odd size', () => {
    const [w, h] = dims(fitWithin(5000, 3333, 1280));
    expect(w).toBe(1280);
    expect(Math.abs(h - (3333 * 1280) / 5000)).toBeLessThanOrEqual(1);
  });
});

describe('nextAttempt (crit. 3: quality ladder, then smaller size, always ends)', () => {
  type Attempt = { quality: number; scale: number };
  const step = (q: number, s: number): Attempt | null => (nextAttempt(q, s) as Attempt | null | undefined) ?? null;

  it('walks 0.85 -> 0.75 -> 0.65 -> 0.55 at full size', () => {
    const a = step(0.85, 1)!;
    expect(a.quality).toBeCloseTo(0.75, 5);
    expect(a.scale).toBe(1);
    const b = step(a.quality, a.scale)!;
    expect(b.quality).toBeCloseTo(0.65, 5);
    const c = step(b.quality, b.scale)!;
    expect(c.quality).toBeCloseTo(0.55, 5);
    expect(c.scale).toBe(1);
  });

  it('after 0.55 shrinks the size by a factor 0.85', () => {
    const next = step(0.55, 1)!;
    expect(next.scale).toBeCloseTo(0.85, 5);
    const again = step(next.quality, next.scale)!;
    expect(again.scale).toBeCloseTo(0.85 * 0.85, 5);
  });

  it('always ends: a finite number of attempts, then it gives up (null)', () => {
    let attempt: Attempt | null = { quality: 0.85, scale: 1 };
    let count = 0;
    while (attempt && count < 100) {
      attempt = step(attempt.quality, attempt.scale);
      count++;
    }
    expect(attempt).toBeNull();
    expect(count).toBeLessThan(100);
  });
});
