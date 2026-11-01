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
