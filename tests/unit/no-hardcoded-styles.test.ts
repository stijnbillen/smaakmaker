import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanStyles } from '../helpers/style-scan';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('scanner negative controls (R-016 crit. 2)', () => {
  it('rejects a hex colour', () => {
    expect(scanStyles('a { color: #c0ffee; }').map((f) => f.kind)).toContain('color');
  });
  it('rejects rgb()', () => {
    expect(scanStyles('a { background: rgb(0 0 0); }').map((f) => f.kind)).toContain('color');
  });
  it('rejects a colour name as value of a colour property', () => {
    expect(scanStyles('a { border: 1px solid red; }').length).toBeGreaterThan(0);
  });
  it('rejects hard-coded font-family and spacing', () => {
    expect(scanStyles('a { font-family: Arial, sans-serif; }').map((f) => f.kind)).toContain('font-family');
    expect(scanStyles('a { padding: 12px; }').map((f) => f.kind)).toContain('spacing');
    expect(scanStyles('a { gap: 8px; }').map((f) => f.kind)).toContain('spacing');
  });
  it('accepts tokens, currentColor, transparent, inherit, 0, auto, calc with tokens', () => {
    const ok = `a {
      color: var(--color-text-body); background: transparent; border: 1px solid var(--color-border);
      fill: currentColor; font-family: var(--font-body); font-family: inherit;
      margin: 0 auto; padding: var(--space-2) var(--space-3); gap: var(--space-1);
      padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
    }`;
    expect(scanStyles(ok)).toEqual([]);
  });
});

describe('src/ has no hard-coded colours, fonts or spacing outside tokens.css (R-016 crit. 2)', () => {
  const sources = files('src').filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith(`styles${sep}tokens.css`));
  it('finds source files to scan', () => {
    expect(sources.length).toBeGreaterThan(3);
  });
  for (const f of sources) {
    it(f, () => {
      expect(scanStyles(readFileSync(f, 'utf8')), f).toEqual([]);
    });
  }
});
