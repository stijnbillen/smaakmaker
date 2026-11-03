import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nl from '../../src/i18n/nl.json';
import { t } from '../../src/i18n/t';

// Resolves "a.b" against flat ("a.b": ...) or nested ({a:{b:...}}) JSON.
function lookup(key: string): unknown {
  const flat = nl as Record<string, unknown>;
  if (key in flat) return flat[key];
  return key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    nl,
  );
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('nl.json navigation and list states (R-016 crit. 1 and 6)', () => {
  const expected: Record<string, string> = {
    'nav.recipes': 'Recepten',
    'nav.favorites': 'Favorieten',
    'nav.new': 'Nieuw',
    'nav.profile': 'Profiel',
    'overview.empty': 'Nog geen recepten.',
    'favorites.empty': 'Nog geen favorieten.',
  };
  for (const [key, text] of Object.entries(expected)) {
    it(`${key} = ${text}`, () => expect(lookup(key)).toBe(text));
  }

  it('nav.label, titles and loading texts exist and are not empty', () => {
    for (const key of ['nav.label', 'overview.loading', 'favorites.title', 'profile.title']) {
      const v = lookup(key);
      expect(typeof v, key).toBe('string');
      expect((v as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('every *.loading and *.empty key is a non-empty string', () => {
    const flat = nl as Record<string, unknown>;
    const keys = Object.keys(flat).filter((k) => /\.(loading|empty)$/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys) {
      const v = flat[k];
      expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
    }
  });
});

describe('nl.json (R-001 crit. 6)', () => {
  it('has the exact connection texts', () => {
    expect(lookup('connection.error')).toBe('Geen verbinding. Probeer opnieuw.');
    expect(lookup('connection.retry')).toBe('Opnieuw proberen');
  });

  it('t() returns the texts from nl.json', () => {
    // t() is typed on keys; cast keeps this test independent of the exact key union.
    const tt = t as unknown as (k: string) => string;
    expect(tt('connection.error')).toBe('Geen verbinding. Probeer opnieuw.');
    expect(tt('connection.retry')).toBe('Opnieuw proberen');
  });

  it('keeps the connection texts out of components (CLAUDE.md: all texts in nl.json)', () => {
    const sources = files('src').filter((f) => /\.(tsx?|jsx?)$/.test(f));
    for (const f of sources) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toContain('Geen verbinding');
      expect(code, f).not.toContain('Opnieuw proberen');
    }
  });
});
