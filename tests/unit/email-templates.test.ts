import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  // Review T-003 finding 5: exact comparison. The generator is run in a scratch directory with a copy of
  // nl.json, so the committed templates are compared byte for byte with what nl.json produces today.
  it('committed templates equal exactly what scripts/make-email-templates.mjs generates from nl.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smaakmaker-tpl-'));
    try {
      mkdirSync(join(dir, 'src/i18n'), { recursive: true });
      copyFileSync('src/i18n/nl.json', join(dir, 'src/i18n/nl.json'));
      execFileSync(process.execPath, [resolve('scripts/make-email-templates.mjs')], { cwd: dir, stdio: 'pipe' });
      for (const file of TEMPLATES) {
        const generated = readFileSync(join(dir, file), 'utf8');
        const committed = readFileSync(file, 'utf8');
        expect(committed.replace(/\r\n/g, '\n'), file).toBe(generated);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
