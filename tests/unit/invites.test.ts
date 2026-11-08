import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// T-027 / R-027. The client module src/lib/invites.ts with the Supabase client mocked: no network.
const rpc = vi.fn();
const signInWithOtp = vi.fn();
const createClient = vi.fn(() => ({ auth: { signInWithOtp } }));

vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...(args as [])) }));

async function load() {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-for-test');
  return import('../../src/lib/invites');
}

beforeEach(() => {
  rpc.mockReset();
  signInWithOtp.mockReset();
  createClient.mockClear();
  rpc.mockResolvedValue({ data: { email: 'jan@mail.be' }, error: null, status: 200 });
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('inviting from the browser (R-027 crit. 3, 11, 12)', () => {
  // crit. 11: "Jan@Mail.be" = "jan@mail.be", spaces around the address are ignored; client side too.
  it('trims and lowercases the address before the database call and before the mail', async () => {
    const { inviteUser } = await load();
    await inviteUser('  Jan@Mail.be ', 'nl');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('invite_user');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_email: 'jan@mail.be', p_lang: 'nl' });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp.mock.calls[0][0].email).toBe('jan@mail.be');
  });

  // crit. 3: mail in the language of the administrator, link and code (shouldCreateUser: the invitation gates it).
  it('sends the mail through the public Auth endpoint with the language of the administrator', async () => {
    const { inviteUser } = await load();
    await inviteUser('jan@mail.be', 'fr');
    const arg = signInWithOtp.mock.calls[0][0];
    expect(arg.options.shouldCreateUser).toBe(true);
    expect(arg.options.data).toEqual({ lang: 'fr' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_lang: 'fr' });
  });

  // Risk "sessie van de beheerder": the mailer must not share or touch the administrator's stored session.
  it('uses a separate session-less client for the mail, with the public key only', async () => {
    const { inviteUser } = await load();
    await inviteUser('jan@mail.be', 'nl');
    expect(createClient).toHaveBeenCalled();
    const [url, key, options] = createClient.mock.calls[0] as unknown as [string, string, { auth: Record<string, unknown> }];
    expect(url).toBe('http://127.0.0.1:54321');
    expect(key).toBe('anon-key-for-test');
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
    expect(typeof options.auth.storageKey).toBe('string');
  });

  // Plan: RPC first (it checks, counts, records), mail second.
  it('does not send a mail when the database refuses (limit, already a member, not an administrator)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'refused' }, status: 400 });
    const { inviteUser } = await load();
    await inviteUser('jan@mail.be', 'nl');
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  // crit. 2: the interface checks first, so an invalid address never reaches the database.
  it('does not call the database or the mail endpoint for an invalid address', async () => {
    const { inviteUser } = await load();
    for (const bad of ['jan@', 'jan mail.be', '', '   ']) {
      await inviteUser(bad, 'nl');
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('no secret key in the invite code (R-027 crit. 12)', () => {
  const source = readFileSync('src/lib/invites.ts', 'utf8');

  it('src/lib/invites.ts reads only the two public settings from the environment', () => {
    const names = [...source.matchAll(/import\.meta\.env\.(\w+)/g)].map((m) => m[1]);
    for (const n of names) expect(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']).toContain(n);
    expect(source).not.toMatch(/service[_-]?role|SERVICE_ROLE|serviceKey/i);
  });

  it('src/lib/invites.ts no longer knows invite codes', () => {
    expect(source).not.toMatch(/create_invite|list_invites|check_invite|consume_invite/);
  });
});
