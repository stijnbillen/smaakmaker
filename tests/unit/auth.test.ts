import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a), verifyOtp: (...a: unknown[]) => verifyOtp(...a), signOut: vi.fn() } },
}));
vi.mock('../../src/i18n/language', () => ({ getLanguage: () => 'fr' }));

import { requestCode, verifyCode } from '../../src/lib/auth';

beforeEach(() => {
  rpc.mockReset();
  signInWithOtp.mockReset();
  verifyOtp.mockReset();
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
  signInWithOtp.mockResolvedValue({ error: null });
});

// T-028 / R-002: sign in with an e-mail address only; the database decides whether a mail may leave.
describe('requestCode (R-002 crit. 2, 3)', () => {
  it('normalises the address with trim().toLowerCase() (crit. 3: " PIET@X.BE " is the same person)', async () => {
    rpc.mockResolvedValue({ data: 'member', error: null });
    await requestCode('  PIET@Example.BE ');
    expect(rpc).toHaveBeenCalledWith('sign_in_status', { p_email: 'piet@example.be' });
    expect(signInWithOtp.mock.calls[0][0].email).toBe('piet@example.be');
  });

  it('unknown address: no GoTrue call, field message auth.unknownAddress (crit. 2)', async () => {
    rpc.mockResolvedValue({ data: 'unknown', error: null });
    const result = await requestCode('nobody@example.be');
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, field: 'email', message: 'auth.unknownAddress' });
  });

  it('member: shouldCreateUser false (crit. 3: no second account)', async () => {
    rpc.mockResolvedValue({ data: 'member', error: null });
    const result = await requestCode('piet@example.be');
    expect(result).toEqual({ ok: true });
    const options = signInWithOtp.mock.calls[0][0].options;
    expect(options.shouldCreateUser).toBe(false);
    expect(options.data).toBeUndefined();
  });

  it('invited: shouldCreateUser true with the interface language (crit. 3)', async () => {
    rpc.mockResolvedValue({ data: 'invited', error: null });
    await requestCode('piet@example.be');
    const options = signInWithOtp.mock.calls[0][0].options;
    expect(options.shouldCreateUser).toBe(true);
    expect(options.data).toEqual({ lang: 'fr' });
  });

  it.each([
    ['invited', { status: 500, message: 'Database error' }],
    ['invited', { status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }],
    ['member', { status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }],
  ])('%s + GoTrue refusal %j reads as unknown address (crit. 2)', async (status, err) => {
    rpc.mockResolvedValue({ data: status, error: null });
    signInWithOtp.mockResolvedValue({ error: err });
    const result = await requestCode('piet@example.be');
    expect(result).toMatchObject({ ok: false, field: 'email', message: 'auth.unknownAddress' });
  });

  // Review T-028 finding 1/2: a 500 for a member is a mail (SMTP) failure, not "no account".
  it('member + GoTrue 500 (mail not sent) is a generic error, not unknown address', async () => {
    rpc.mockResolvedValue({ data: 'member', error: null });
    signInWithOtp.mockResolvedValue({ error: { status: 500, message: 'Error sending magic link email' } });
    const result = await requestCode('piet@example.be');
    expect(result).toMatchObject({ ok: false, field: 'email', message: 'auth.error' });
  });

  it('other GoTrue errors give auth.error', async () => {
    rpc.mockResolvedValue({ data: 'member', error: null });
    signInWithOtp.mockResolvedValue({ error: { status: 429, message: 'rate limit' } });
    const result = await requestCode('piet@example.be');
    expect(result).toMatchObject({ ok: false, field: 'email', message: 'auth.error' });
  });

  it('connection error of the RPC gives no field message (banner takes over)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FetchError: network down' }, status: 0 });
    const result = await requestCode('piet@example.be');
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, field: 'email' });
    expect((result as { message?: string }).message).toBeUndefined();
  });
});

describe('verifyCode (R-002 crit. 3, 7)', () => {
  it('normalises the address and trims the code', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    await verifyCode(' PIET@Example.BE ', ' 123456 ');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'piet@example.be', token: '123456', type: 'email' });
  });

  it('a wrong code gives auth.codeInvalid at the code field (crit. 7)', async () => {
    verifyOtp.mockResolvedValue({ error: { status: 403, message: 'Token has expired or is invalid' } });
    const result = await verifyCode('piet@example.be', '000000');
    expect(result).toMatchObject({ ok: false, field: 'code', message: 'auth.codeInvalid' });
  });
});
