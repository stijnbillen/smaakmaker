import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGLISH_SCAN_TERMS } from '../helpers/english-terms';

// T-022 / R-026 crit. 2, 3 and 7: the second language is French; the code "en", the Engelse naam kolom
// and English test data are gone everywhere. The patterns are assembled from parts, so this file never matches itself.
const EN = ['e', 'n'].join('');
const SELF = join('tests', 'unit', 'no-english.test.ts');

const ROOTS = ['src', 'supabase/migrations', 'supabase/templates', 'scripts', 'tests'];
const TEXT_EXT = /\.(tsx?|mjs|cjs|js|json|sql|html|toml|ps1|psd1|css|md)$/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (['node_modules', 'dist', 'test-results', 'playwright-report'].includes(name)) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = ROOTS.flatMap(walk).filter((f) => TEXT_EXT.test(f) && f !== SELF);
const read = (f: string) => readFileSync(f, 'utf8');

/** Lines (file:line) that match a pattern; `skip` lists files where the pattern is no language code. */
function hits(pattern: RegExp, skip: (f: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (skip(f)) continue;
    read(f)
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (pattern.test(line)) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  return out;
}

// The Dutch word "en" (and) is a normal value in nl.json and not a language code.
const isDutchText = (f: string) => relative('.', f).split(sep).join('/') === 'src/i18n/nl.json';

describe('no English language code left (R-026 crit. 2)', () => {
  it('the scan reads files in every root (negative control)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.startsWith('src'))).toBe(true);
    expect(files.some((f) => f.includes('migrations'))).toBe(true);
    expect(files.some((f) => f.startsWith('tests'))).toBe(true);
    expect(files.some((f) => f.startsWith('scripts'))).toBe(true);
  });

  it('the patterns do find what they look for (negative control)', () => {
    const p = new RegExp(`(?:${EN}\\.json|'${EN}'|"${EN}"|lang="${EN}"|${EN}-GB)`);
    for (const sample of [`import x from './${EN}.json'`, `lang('${EN}')`, `{"k": "${EN}"}`, `<html lang="${EN}">`, `${EN}-GB`]) {
      expect(p.test(sample), sample).toBe(true);
    }
    expect(p.test(`lang('fr')`)).toBe(false);
  });

  it(`no file mentions ${EN}.json, '${EN}', "${EN}", lang="${EN}" or ${EN}-GB`, () => {
    const p = new RegExp(`(?:${EN}\\.json|'${EN}'|"${EN}"|lang="${EN}"|${EN}-GB)`);
    expect(hits(p, isDutchText)).toEqual([]);
  });

  it(`src/i18n/${EN}.json is gone and fr.json exists`, () => {
    expect(existsSync(`src/i18n/${EN}.json`)).toBe(false);
    expect(existsSync('src/i18n/fr.json')).toBe(true);
  });
});

describe('no column or field with the English name left (R-026 crit. 3)', () => {
  it(`no name_${EN} or nameEn in code, migrations or tests`, () => {
    expect(hits(new RegExp(`name_${EN}\\b|name${EN[0].toUpperCase()}${EN[1]}\\b`))).toEqual([]);
  });

  it('migrations use name_fr', () => {
    const sql = files.filter((f) => f.includes('migrations')).map(read).join('\n');
    expect(sql).toContain('name_fr');
  });
});

describe('no English test data (R-026 crit. 7)', () => {
  // Terms of the old starting list as a whole string literal; "tomato" is also a CSS colour name in the style scan.
  const allowed = (f: string) => relative('.', f).split(sep).join('/') === 'tests/helpers/style-scan.ts';

  it('the term list is not empty (negative control)', () => {
    expect(ENGLISH_SCAN_TERMS.length).toBeGreaterThanOrEqual(8);
  });

  it('no source or test uses an old English catalogue term as a string literal', () => {
    const out: string[] = [];
    const quote = '[\'"`]';
    const p = new RegExp(`${quote}(?:${ENGLISH_SCAN_TERMS.join('|')})${quote}`, 'i');
    for (const f of files.filter((f) => /\.(tsx?|mjs|sql)$/.test(f) && !allowed(f))) {
      read(f)
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (p.test(line)) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(out).toEqual([]);
  });
});
