import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fr from '../../src/i18n/fr.json';
import nl from '../../src/i18n/nl.json';

// T-028 / R-002 crit. 1: the sign-in screen knows no invitation code any more.
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('no trace of invitation codes at sign-in (R-002 crit. 1)', () => {
  it('nl.json and fr.json no longer have auth.haveInvite and auth.inviteLabel', () => {
    for (const map of [nl, fr] as Record<string, string>[]) {
      expect(map['auth.haveInvite']).toBeUndefined();
      expect(map['auth.inviteLabel']).toBeUndefined();
    }
  });

  // crit. 2: the unknown-address message points to an administrator, not to a code the screen cannot take.
  it('auth.unknownAddress keeps its key but does not ask for a code, in both languages', () => {
    for (const map of [nl, fr] as Record<string, string>[]) {
      expect(map['auth.unknownAddress']).toBeTruthy();
    }
    expect((nl as Record<string, string>)['auth.unknownAddress']).not.toMatch(/uitnodigingscode/i);
    expect((fr as Record<string, string>)['auth.unknownAddress']).not.toMatch(/code d'invitation/i);
  });

  it('src/ mentions inviteCode, invite_code, check_invite and refresh_pending_invite nowhere', () => {
    const hits: string[] = [];
    for (const f of files('src').filter((p) => /\.(tsx?|json)$/.test(p))) {
      const text = readFileSync(f, 'utf8');
      for (const w of ['inviteCode', 'invite_code', 'check_invite', 'refresh_pending_invite']) {
        if (text.includes(w)) hits.push(`${f}: ${w}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('SignInPage has no invite field or button', () => {
    const page = readFileSync('src/pages/SignInPage.tsx', 'utf8');
    expect(page).not.toMatch(/haveInvite|inviteLabel|name="invite"|invite-error/);
  });

  it('AuthField is only email or code', () => {
    const auth = readFileSync('src/lib/auth.ts', 'utf8');
    expect(auth).toMatch(/AuthField\s*=\s*'email'\s*\|\s*'code'\s*;/);
  });
});
