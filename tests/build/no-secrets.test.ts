import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serviceKey } from '../helpers/supabase-admin';

const built = existsSync('dist');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const textExt = /\.(js|mjs|css|html|json|webmanifest|map|txt|svg)$/;

// T-001 criterion 7
describe('no secrets in build (R-001 crit. 7)', () => {
  // Fails (not skips) without a build: the loop always runs `npm run build` first.
  it('dist/ is built (run `npm run build` first)', () => {
    expect(built).toBe(true);
  });

  const contents = built
    ? files('dist')
        .filter((f) => textExt.test(f))
        .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
    : [];

  it('does not contain the service key', () => {
    const key = serviceKey();
    for (const { f, text } of contents) expect(text.includes(key), f).toBe(false);
  });

  it('contains no sb_secret_ keys', () => {
    for (const { f, text } of contents) expect(text, f).not.toContain('sb_secret_');
  });

  it('only contains JWTs with role anon', () => {
    const jwt = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;
    for (const { f, text } of contents) {
      for (const m of text.matchAll(jwt)) {
        let payload: { role?: string };
        try {
          payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
        } catch {
          continue; // not a JWT after all
        }
        expect(payload.role, f).toBe('anon');
      }
    }
  });
});

// T-001 criterion 7, static part
describe('client source env usage (R-001 crit. 7)', () => {
  const sources = files('src').filter((f) => /\.(tsx?|jsx?)$/.test(f));

  it('only reads the public Supabase env vars', () => {
    // Vite built-ins are harmless and allowed.
    const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR']);
    for (const f of sources) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
        expect(allowed.has(m[1]), `${f}: ${m[1]}`).toBe(true);
      }
      expect(code, f).not.toMatch(/import\.meta\.env\s*(\[|[^.\w])/); // no dynamic env access
    }
  });

  it('mentions no SERVICE_ROLE or SECRET, and never imports test helpers', () => {
    for (const f of sources) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/SERVICE_ROLE|SECRET/i);
      expect(code, f).not.toMatch(/from\s+['"][^'"]*tests\//);
    }
  });
});
