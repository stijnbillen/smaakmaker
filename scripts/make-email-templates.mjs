// Builds the Supabase auth mail templates from the email.* texts in src/i18n/nl.json and fr.json,
// so that all visible texts have one source. Run: node scripts/make-email-templates.mjs
// The mail holds a full Dutch block and then a full French block (each with link and code), and the
// subject lines in supabase/config.toml become "{nl} / {fr}". Only those two lines of config.toml change.
// The output is committed; tests/unit/email-templates.test.ts keeps it in sync with the text files.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const nl = JSON.parse(readFileSync('src/i18n/nl.json', 'utf8'));
const fr = JSON.parse(readFileSync('src/i18n/fr.json', 'utf8'));

// Same escaping the test expects: & < > " (apostrophes stay as they are).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One language block. Mail clients ignore external CSS and CSS variables, so the palette is repeated inline
// (values of tokens.css: --color-text-body, --color-accent, --color-on-accent, --color-text-muted).
const block = (texts) => `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;margin:0 0 16px;">${esc(texts['email.heading'])}</h1>
    <p>${esc(texts['email.linkIntro'])}</p>
    <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#a8321a;color:#fffaf0;border-radius:999px;text-decoration:none;font-weight:600;">${esc(texts['email.linkButton'])}</a></p>
    <p>${esc(texts['email.codeIntro'])}</p>
    <p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:8px 0 24px;">{{ .Token }}</p>
    <p style="color:#6b5648;font-size:14px;">${esc(texts['email.ignore'])}</p>`;

// T-027 / R-027: the template follows user_metadata.lang (set by the invitation): "fr" gives the French block,
// "nl" the Dutch block, anything else (existing users without a language) the bilingual mail, Dutch first.
const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:24px;background:#fbf5ea;color:#2b1d14;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;">
    {{ if eq .Data.lang "fr" }}
    <div lang="fr">
    ${block(fr)}
    </div>
    {{ else if eq .Data.lang "nl" }}
    ${block(nl)}
    {{ else }}
    ${block(nl)}
    <hr style="border:0;border-top:1px solid #d9ccb6;margin:32px 0;">
    <div lang="fr">
    ${block(fr)}
    </div>
    {{ end }}
  </body>
</html>
`;

mkdirSync('supabase/templates', { recursive: true });
// A new user gets the confirmation mail, an existing user the magic link mail: both carry link and code.
for (const name of ['confirmation', 'magic_link']) {
  writeFileSync(`supabase/templates/${name}.html`, html);
}

// Subject lines in config.toml: rewrite only the two `subject = ` lines below the two templates.
const subject = `${nl['email.subject']} / ${fr['email.subject']}`;
const toml = readFileSync('supabase/config.toml', 'utf8');
const updated = toml.replace(
  /(\[auth\.email\.template\.(?:confirmation|magic_link)\]\r?\n)subject = "[^"]*"/g,
  (_, head) => `${head}subject = "${subject}"`,
);
if (updated !== toml) writeFileSync('supabase/config.toml', updated);
