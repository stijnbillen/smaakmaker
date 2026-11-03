// Builds the Supabase auth mail templates from the email.* texts in src/i18n/nl.json,
// so that all visible texts have one source. Run: node scripts/make-email-templates.mjs
// The output is committed; tests/unit/email-templates.test.ts keeps it in sync with nl.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const nl = JSON.parse(readFileSync('src/i18n/nl.json', 'utf8'));

// Same escaping the test expects: & < > " (apostrophes stay as they are).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Mail clients ignore external CSS and CSS variables, so the palette is repeated inline here
// (values of tokens.css: --color-bg, --color-text-body, --color-accent, --color-on-accent).
const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:24px;background:#fbf5ea;color:#2b1d14;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;">
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;margin:0 0 16px;">${esc(nl['email.heading'])}</h1>
    <p>${esc(nl['email.linkIntro'])}</p>
    <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#a8321a;color:#fffaf0;border-radius:999px;text-decoration:none;font-weight:600;">${esc(nl['email.linkButton'])}</a></p>
    <p>${esc(nl['email.codeIntro'])}</p>
    <p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:8px 0 24px;">{{ .Token }}</p>
    <p style="color:#6b5648;font-size:14px;">${esc(nl['email.ignore'])}</p>
  </body>
</html>
`;

mkdirSync('supabase/templates', { recursive: true });
// A new user gets the confirmation mail, an existing user the magic link mail: both carry link and code.
for (const name of ['confirmation', 'magic_link']) {
  writeFileSync(`supabase/templates/${name}.html`, html);
}
