import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

// T-004 crit. 4 (R-017): becoming administrator is only possible outside the app.
describe('first administrator is set outside the app (R-017 crit. 4)', () => {
  const sources = files('src').filter((f) => /\.(ts|tsx|json|css)$/.test(f));

  it('src/ never mentions grant_admin', () => {
    for (const f of sources) expect(readFileSync(f, 'utf8'), f).not.toMatch(/grant_admin/);
  });

  it('src/ never writes to the admins table', () => {
    for (const f of sources) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\(\s*['"`]admins['"`]\s*\)/);
  });

  it('the route list has no admin-setting route', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const paths = [...app.matchAll(/path=["']([^"']*)["']/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p, p).not.toMatch(/admin|beheerder|beheer/i);
  });

  // T-027 / R-027: codes are gone; the first invitation is a row for an e-mail address.
  it('docs/beheer.md describes the SQL for the first invitation and the first administrator', () => {
    expect(existsSync('docs/beheer.md')).toBe(true);
    const doc = readFileSync('docs/beheer.md', 'utf8');
    expect(doc).toMatch(/insert into public\.invitations/i);
    expect(doc).not.toMatch(/generate_invite_code\(\)/);
    expect(doc).not.toMatch(/insert into public\.invites\b/i);
    expect(doc).toMatch(/select public\.grant_admin\(/i);
  });
});
