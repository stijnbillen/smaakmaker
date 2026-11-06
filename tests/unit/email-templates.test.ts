import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json';
import nl from '../../src/i18n/nl.json';

const flat = nl as Record<string, string>;
const TEMPLATES = ['supabase/templates/confirmation.html', 'supabase/templates/magic_link.html'];

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// T-003 crit. 6 (R-002): the mail has the link AND the 6-digit code, and all texts come from nl.json.
describe('e-mail templates (R-002 crit. 6)', () => {
  for (const file of TEMPLATES) {
    describe(file, () => {
      it('exists', () => expect(existsSync(file)).toBe(true));

      it('contains the login link and the 6-digit code placeholders', () => {
        const html = readFileSync(file, 'utf8');
        expect(html).toContain('{{ .ConfirmationURL }}');
        expect(html).toContain('{{ .Token }}');
      });
    });
  }

  it('has email.* texts in nl.json', () => {
    const keys = Object.keys(flat).filter((k) => k.startsWith('email.'));
    expect(keys.length).toBeGreaterThan(0);
  });

  it('every email.* text appears in a template or in config.toml (subject)', () => {
    const haystack =
      TEMPLATES.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n') +
      '\n' +
      readFileSync('supabase/config.toml', 'utf8');
    for (const key of Object.keys(flat).filter((k) => k.startsWith('email.'))) {
      const value = flat[key];
      expect(haystack.includes(value) || haystack.includes(escapeHtml(value)), key).toBe(true);
    }
  });

  // T-018 / R-023 crit. 7: Dutch and English in the same mail, Dutch first.
  describe('bilingual mail (R-023 crit. 7)', () => {
    const enFlat = en as Record<string, string>;
    const subject = `${flat['email.subject']} / ${enFlat['email.subject']}`;
    const inTemplate = (html: string, value: string) => html.includes(value) || html.includes(escapeHtml(value));

    for (const file of TEMPLATES) {
      it(`${file}: has every email.* text of nl.json AND en.json (subject is in config.toml)`, () => {
        const html = readFileSync(file, 'utf8');
        for (const [name, map] of [['nl', flat], ['en', enFlat]] as const) {
          for (const key of Object.keys(map).filter((k) => k.startsWith('email.') && k !== 'email.subject')) {
            expect(inTemplate(html, map[key]), `${name}:${key}`).toBe(true);
          }
        }
      });

      it(`${file}: Dutch heading comes before the English heading`, () => {
        const html = readFileSync(file, 'utf8');
        const nlAt = html.indexOf(escapeHtml(flat['email.heading']));
        const enAt = html.indexOf(escapeHtml(enFlat['email.heading']));
        expect(nlAt).toBeGreaterThanOrEqual(0);
        expect(enAt).toBeGreaterThanOrEqual(0);
        expect(nlAt).toBeLessThan(enAt);
      });

      it(`${file}: each language block has its own link and code, with lang attributes`, () => {
        const html = readFileSync(file, 'utf8');
        expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBe(2);
        expect(html.match(/\{\{ \.Token \}\}/g)?.length).toBe(2);
        expect(html).toMatch(/lang="nl"/);
        expect(html).toMatch(/<div lang="en"/);
        expect(html.indexOf('lang="nl"')).toBeLessThan(html.indexOf('lang="en"'));
      });
    }

    it('the subject in config.toml is "{nl} / {en}", Dutch first, for both templates', () => {
      const toml = readFileSync('supabase/config.toml', 'utf8');
      for (const name of ['confirmation', 'magic_link']) {
        const section = new RegExp(`\\[auth\\.email\\.template\\.${name}\\]\\r?\\nsubject = "([^"]*)"`).exec(toml);
        expect(section, name).not.toBeNull();
        expect(section?.[1], name).toBe(subject);
      }
    });
  });

  // Review T-003 finding 5: exact comparison. The generator is run in a scratch directory with a copy of
  // nl.json, so the committed templates are compared byte for byte with what nl.json produces today.
  it('committed templates equal exactly what scripts/make-email-templates.mjs generates from nl.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smaakmaker-tpl-'));
    try {
      mkdirSync(join(dir, 'src/i18n'), { recursive: true });
      mkdirSync(join(dir, 'supabase'), { recursive: true });
      copyFileSync('src/i18n/nl.json', join(dir, 'src/i18n/nl.json'));
      copyFileSync('src/i18n/en.json', join(dir, 'src/i18n/en.json'));
      copyFileSync('supabase/config.toml', join(dir, 'supabase/config.toml'));
      execFileSync(process.execPath, [resolve('scripts/make-email-templates.mjs')], { cwd: dir, stdio: 'pipe' });
      for (const file of TEMPLATES) {
        const generated = readFileSync(join(dir, file), 'utf8');
        const committed = readFileSync(file, 'utf8');
        expect(committed.replace(/\r\n/g, '\n'), file).toBe(generated.replace(/\r\n/g, '\n'));
      }
      // The subject lines in config.toml are written by the generator too; the rest of the file stays as it was.
      const subjects = (toml: string) => toml.split(/\r?\n/).filter((l) => /^subject = /.test(l));
      const committedToml = readFileSync('supabase/config.toml', 'utf8');
      const generatedToml = readFileSync(join(dir, 'supabase/config.toml'), 'utf8');
      expect(subjects(committedToml)).toEqual(subjects(generatedToml));
      expect(generatedToml.replace(/\r\n/g, '\n')).toBe(committedToml.replace(/\r\n/g, '\n'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The generator must only touch the two subject lines of config.toml.
  it('the generator changes nothing in config.toml except the two subject lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smaakmaker-tpl-'));
    try {
      mkdirSync(join(dir, 'src/i18n'), { recursive: true });
      mkdirSync(join(dir, 'supabase'), { recursive: true });
      copyFileSync('src/i18n/nl.json', join(dir, 'src/i18n/nl.json'));
      copyFileSync('src/i18n/en.json', join(dir, 'src/i18n/en.json'));
      const original = readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n');
      // Start from an old Dutch-only subject to prove the lines are rewritten.
      const old = original.replace(/^subject = ".*"$/gm, 'subject = "old"');
      writeFileSync(join(dir, 'supabase/config.toml'), old);
      execFileSync(process.execPath, [resolve('scripts/make-email-templates.mjs')], { cwd: dir, stdio: 'pipe' });
      const after = readFileSync(join(dir, 'supabase/config.toml'), 'utf8').replace(/\r\n/g, '\n');
      expect(after).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
