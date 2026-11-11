import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nl from '../../src/i18n/nl.json';
import ts from 'typescript';
import fr from '../../src/i18n/fr.json';
import { t, type TextKey } from '../../src/i18n/t';
import nlBefore from './fixtures/nl-before-T-018.json';
import { RETIRED_LANG } from '../helpers/retired-lang';

// T-018 / R-023 + T-022 / R-026: the Dutch and French text files must be interchangeable.
type TextMap = Record<string, string>;

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/** Differences between two text files; an empty list means they are in line. */
function compareTexts(a: TextMap, b: TextMap): string[] {
  const problems: string[] = [];
  for (const k of Object.keys(a)) if (!(k in b)) problems.push(`missing in second: ${k}`);
  for (const k of Object.keys(b)) if (!(k in a)) problems.push(`missing in first: ${k}`);
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue;
    if (typeof a[k] !== 'string' || a[k].trim() === '') problems.push(`empty in first: ${k}`);
    if (typeof b[k] !== 'string' || b[k].trim() === '') problems.push(`empty in second: ${k}`);
    if (typeof a[k] === 'string' && typeof b[k] === 'string' && placeholders(a[k]).join() !== placeholders(b[k]).join()) {
      problems.push(`placeholders differ: ${k}`);
    }
  }
  return problems;
}

describe('nl.json and fr.json are in line (R-026 crit. 1)', () => {
  const nlMap = nl as TextMap;
  const frMap = fr as TextMap;

  it('the English text file is gone (R-026 crit. 1)', () => {
    expect(existsSync(`src/i18n/${RETIRED_LANG}.json`)).toBe(false);
    expect(existsSync('src/i18n/fr.json')).toBe(true);
  });

  it('have the same keys, both directions', () => {
    const nlKeys = new Set(Object.keys(nlMap));
    const frKeys = new Set(Object.keys(frMap));
    expect([...nlKeys].filter((k) => !frKeys.has(k))).toEqual([]);
    expect([...frKeys].filter((k) => !nlKeys.has(k))).toEqual([]);
  });

  it('have no empty values', () => {
    for (const [name, map] of [['nl', nlMap], ['fr', frMap]] as const) {
      for (const [k, v] of Object.entries(map)) {
        expect(typeof v === 'string' && v.trim().length > 0, `${name}:${k}`).toBe(true);
      }
    }
  });

  it('have the same {placeholders} per key', () => {
    const wrong = Object.keys(nlMap).filter((k) => k in frMap && placeholders(nlMap[k]).join() !== placeholders(frMap[k]).join());
    expect(wrong).toEqual([]);
  });

  // R-026 crit. 1: a full translation, not a copy of the Dutch (or English) text.
  it('no French value equals the Dutch one, except a short explicit list', () => {
    const SAME_ALLOWED = new Set([
      'app.name', 'app.title', 'language.nl', 'language.fr', 'time.minutes',
      'weekMenu.tabMenu', // "Menu" is the same word in Dutch and French
    ]);
    const same = Object.keys(nlMap).filter((k) => k in frMap && nlMap[k] === frMap[k] && !SAME_ALLOWED.has(k));
    // Symbols without letters ("…", "·") and very short unit-like values are not translations either.
    const real = same.filter((k) => hasLetters(nlMap[k]) && nlMap[k].replace(PLACEHOLDER, '').trim().length > 3);
    expect(real).toEqual([]);
  });

  it('has fixed French texts for a sample of keys', () => {
    expect(frMap['nav.profile']).toBe('Profil');
    expect(frMap['language.fr']).toBe('Français');
    expect(frMap['time.hours']).toBe('{h} h');
    expect(frMap['time.minutes']).toBe('{m} min');
  });

  it('French size labels (R-026 crit. 5)', () => {
    expect(frMap['recipe.sizeSmall']).toBe('petite taille');
    expect(frMap['recipe.sizeMedium']).toBe('taille moyenne');
    expect(frMap['recipe.sizeLarge']).toBe('grande taille');
  });

  it('compareTexts finds a deliberately different file (negative control)', () => {
    expect(compareTexts({ a: 'x {n}' }, { a: 'x {n}' })).toEqual([]);
    expect(compareTexts({ a: 'x', b: 'y' }, { a: 'x' }).length).toBeGreaterThan(0);
    expect(compareTexts({ a: 'x' }, { a: 'x', c: 'z' }).length).toBeGreaterThan(0);
    expect(compareTexts({ a: 'x' }, { a: '  ' }).length).toBeGreaterThan(0);
    expect(compareTexts({ a: 'x {n}' }, { a: 'x {m}' }).length).toBeGreaterThan(0);
  });

  it('TextKey stays keyof typeof nl and fr.json is typed Record<TextKey, string> (missing key fails tsc)', () => {
    const t_ts = readFileSync('src/i18n/t.ts', 'utf8');
    expect(t_ts).toMatch(/type TextKey\s*=\s*keyof typeof nl\b/);
    const typed = files('src/i18n')
      .filter((f) => /\.tsx?$/.test(f))
      .some((f) => /Record<TextKey,\s*string>/.test(readFileSync(f, 'utf8')));
    expect(typed).toBe(true);
    // Compile-time proof that the French file covers every key.
    const check: Record<TextKey, string> = fr;
    expect(Object.keys(check).length).toBeGreaterThan(0);
  });

  it('has the new keys of T-018 in both files', () => {
    for (const k of ['language.label', 'language.nl', 'language.fr', 'app.title', 'format.dateTime']) {
      expect(nlMap[k], `nl:${k}`).toBeTruthy();
      expect(frMap[k], `fr:${k}`).toBeTruthy();
    }
    // Each language is named in its own language, whatever the interface language is.
    expect(nlMap['language.nl']).toBe('Nederlands');
    expect(nlMap['language.fr']).toBe('Français');
    expect(frMap['language.nl']).toBe('Nederlands');
    expect(frMap['language.fr']).toBe('Français');
    expect(nlMap['language.en']).toBeUndefined();
  });

  it('has the brand the requirement names', () => {
    expect(frMap['app.name']).toBe('Smaakmaker');
  });
});

describe('nl.json stays as before T-018 (R-023 crit. 8)', () => {
  it('every existing key has exactly the same value; new keys are allowed', () => {
    const now = nl as TextMap;
    // T-027 (R-027) replaces the invitation codes by e-mail invitations: those invites.* keys
    // are removed or reworded on purpose. Every other key must still be untouched.
    // T-028 (R-002) takes the invitation code out of the sign-in screen: two keys go, one text loses its question.
    const replacedByT027 = (k: string) =>
      /^invites\.(new|copy|copied|usedBy|unknownUser|expiresOn|empty|status\..+)$/.test(k);
    const replacedByT028 = (k: string) => ['auth.haveInvite', 'auth.inviteLabel', 'auth.unknownAddress'].includes(k);
    // T-029 (R-028) changes two sort texts on purpose: "Nieuwste" is dropped (the default sort is now
    // "Aanmaakdatum") and "Beoordeling" becomes "Aantal sterren". Every other key stays as it was.
    const changedByT029 = new Set(['overview.sortNewest', 'overview.sortRating']);
    const changed = Object.entries(nlBefore as TextMap)
      .filter(([k, v]) => !replacedByT027(k) && !replacedByT028(k) && !changedByT029.has(k) && now[k] !== v)
      .map(([k]) => k);
    expect(changed).toEqual([]);
  });
});

// Source scan with the TypeScript parser, so comments never count and JSX is read as JSX.
const SRC = files('src').filter((f) => /\.tsx?$/.test(f));
const parse = (f: string) =>
  ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

// Allowed literal texts: the brand, the language names (always in their own language) and symbols.
const ALLOWED_LITERALS = new Set(['Smaakmaker', 'Nederlands', 'Français']);
const LITERAL_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const hasLetters = (s: string) => /\p{L}/u.test(s);

describe('no literal visible text in components (R-023 crit. 5)', () => {
  it('finds no letters in JSX text nodes and no literal aria-label, placeholder, title or alt', () => {
    const found: string[] = [];
    for (const f of SRC.filter((p) => p.endsWith('.tsx'))) {
      walk(parse(f), (n) => {
        if (ts.isJsxText(n)) {
          const text = n.getText().trim();
          if (text && hasLetters(text) && !ALLOWED_LITERALS.has(text)) found.push(`${f}: text "${text}"`);
        }
        if (ts.isJsxAttribute(n) && LITERAL_ATTRIBUTES.has(n.name.getText()) && n.initializer && ts.isStringLiteral(n.initializer)) {
          const v = n.initializer.text;
          if (hasLetters(v) && !ALLOWED_LITERALS.has(v)) found.push(`${f}: ${n.name.getText()}="${v}"`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it('the scan sees a literal text (negative control)', () => {
    const sf = ts.createSourceFile('x.tsx', '<p aria-label="Sluiten">Hallo wereld</p>', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hits: string[] = [];
    walk(sf, (n) => {
      if (ts.isJsxText(n) && hasLetters(n.getText())) hits.push('text');
      if (ts.isJsxAttribute(n) && LITERAL_ATTRIBUTES.has(n.name.getText())) hits.push('attr');
    });
    // Visit order (attributes before child text) is a parser detail; only both hits matter.
    expect([...hits].sort()).toEqual(['attr', 'text']);
  });

  it('no Dutch text of 2 or more words from nl.json appears as a string in src (comments excluded)', () => {
    const strings: Array<{ f: string; s: string }> = [];
    for (const f of SRC) {
      walk(parse(f), (n) => {
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
          strings.push({ f, s: n.text });
        }
        if (ts.isJsxText(n)) strings.push({ f, s: n.getText() });
      });
    }
    const multiWord = Object.entries(nl as TextMap).filter(
      ([, v]) => v.replace(PLACEHOLDER, ' ').split(/\s+/).filter(hasLetters).length >= 2,
    );
    expect(multiWord.length).toBeGreaterThan(10);
    const leaked = multiWord.filter(([, v]) => strings.some(({ s }) => s.includes(v))).map(([k]) => k);
    expect(leaked).toEqual([]);
  });

  // T-027 / R-027: the code screen is replaced by the e-mail screen; old keys out, new keys in both languages.
  it('the invite texts of the e-mail screen exist in both languages and the code texts are gone', () => {
    for (const k of [
      'invites.emailLabel',
      'invites.submit',
      'invites.sent',
      'invites.sentOn',
      'invites.validUntil',
      'invites.resend',
      'invites.revoke',
      'invites.revokeQuestion',
      'invites.revokeConfirm',
      'invites.invalidEmail',
      'invites.alreadyMember',
      'invites.rateLimited',
      'invites.mailFailed',
      'invites.error',
    ]) {
      expect((nl as TextMap)[k], `nl ${k}`).toBeTruthy();
      expect((fr as TextMap)[k], `fr ${k}`).toBeTruthy();
    }
    for (const k of ['new', 'copy', 'copied', 'usedBy', 'unknownUser', 'expiresOn', 'status.open', 'status.used', 'status.expired']) {
      expect((nl as TextMap)[`invites.${k}`], `nl ${k}`).toBeUndefined();
      expect((fr as TextMap)[`invites.${k}`], `fr ${k}`).toBeUndefined();
    }
    expect((nl as TextMap)['invites.empty']).toBe('Geen openstaande uitnodigingen.');
  });
});

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
