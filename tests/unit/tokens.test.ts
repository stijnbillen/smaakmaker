import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readTokens } from '../helpers/color';

describe('contrast function (R-016 crit. 3, known values)', () => {
  it('black on white = 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('#777777 on white is about 4.48 (fails 4.5)', () => {
    const r = contrastRatio('#777777', '#ffffff');
    expect(r).toBeCloseTo(4.48, 1);
    expect(r).toBeLessThan(4.5);
  });
  it('#767676 on white is about 4.54 (passes 4.5)', () => {
    const r = contrastRatio('#767676', '#ffffff');
    expect(r).toBeCloseTo(4.54, 1);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
  it('refuses translucent colours with a clear message', () => {
    expect(() => contrastRatio('#00000080', '#ffffff')).toThrow(/transparantie/);
  });
});

describe('tokens.css (R-016 crit. 2 and 3)', () => {
  it('exists and defines colour, font and space tokens in :root', () => {
    expect(existsSync('src/styles/tokens.css')).toBe(true);
    const names = Object.keys(readTokens());
    for (const prefix of ['--color-', '--font-', '--space-']) {
      expect(names.filter((n) => n.startsWith(prefix)).length, prefix).toBeGreaterThan(0);
    }
  });

  it('defines the agreed support tokens', () => {
    const tokens = readTokens();
    const needed = ['--color-focus', '--color-border', '--color-theme', '--color-bg', '--font-heading', '--font-body', '--nav-height'];
    for (const n of needed) {
      expect(tokens[n], n).toBeDefined();
    }
    expect(tokens['--tap-min']).toBe('44px');
  });

  it('every --color-text-* has >= 4.5:1 on every --color-bg-*', () => {
    const tokens = readTokens();
    const texts = Object.keys(tokens).filter((n) => n.startsWith('--color-text-'));
    const bgs = Object.keys(tokens).filter((n) => n.startsWith('--color-bg-'));
    expect(texts.length).toBeGreaterThan(0);
    expect(bgs.length).toBeGreaterThan(0);
    for (const tx of texts) {
      for (const bg of bgs) {
        expect(contrastRatio(tokens[tx], tokens[bg]), `${tx} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('every --color-on-<x> has >= 4.5:1 on --color-<x>', () => {
    const tokens = readTokens();
    const ons = Object.keys(tokens).filter((n) => n.startsWith('--color-on-'));
    expect(ons.length).toBeGreaterThan(0);
    for (const on of ons) {
      const base = `--color-${on.slice('--color-on-'.length)}`;
      expect(tokens[base], `${base} (partner of ${on})`).toBeDefined();
      expect(contrastRatio(tokens[on], tokens[base]), `${on} on ${base}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('--color-focus has >= 3:1 on every --color-bg-* (non-text contrast)', () => {
    const tokens = readTokens();
    for (const bg of Object.keys(tokens).filter((n) => n.startsWith('--color-bg-'))) {
      expect(contrastRatio(tokens['--color-focus'], tokens[bg]), `focus on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});
