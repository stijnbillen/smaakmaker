import type { TextKey } from '../i18n/t';
import { isConnectionError } from './connection';
import { supabase } from './supabase';

export type AuthField = 'email' | 'invite' | 'code';

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      /** Text to show at `field`; undefined when the failure is a connection error (banner takes over). */
      message?: TextKey;
      field: AuthField;
      cause: unknown;
      status: number | undefined;
    };

const OK: AuthResult = { ok: true };

interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

function asLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
}

function failure(field: AuthField, cause: unknown, status: number | undefined, message: TextKey): AuthResult {
  // Connection errors get the banner from ConnectionProvider, not a field message.
  const connection = isConnectionError(typeof cause === 'object' && cause ? { ...cause, status } : cause);
  return { ok: false, field, cause, status, message: connection ? undefined : message };
}

/**
 * Asks for the mail with login link and 6-digit code.
 * With an invite code a new account may be created; without one only existing users get a mail.
 */
export async function requestCode(email: string, opts: { inviteCode?: string } = {}): Promise<AuthResult> {
  const inviteCode = opts.inviteCode?.trim();
  if (inviteCode) {
    // Check first: GoTrue answers a refusal by the database trigger with a vague 500.
    const check = await supabase.rpc('check_invite', { code: inviteCode });
    if (check.error) return failure('invite', check.error, check.status, 'auth.error');
    if (check.data !== true) return failure('invite', null, undefined, 'auth.codeInvalid');
    // An unconfirmed address keeps the code of its first request. If that code is spent or expired,
    // this removes the pending user so the request below creates a fresh one with the new code.
    const refresh = await supabase.rpc('refresh_pending_invite', { p_email: email.trim(), p_code: inviteCode });
    if (refresh.error) return failure('invite', refresh.error, refresh.status, 'auth.error');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: Boolean(inviteCode),
      ...(inviteCode ? { data: { invite_code: inviteCode } } : {}),
      // Opened from the mail: a plain link back to the app (implicit flow, works in any browser).
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (!error) return OK;

  const e = asLike(error);
  if (!inviteCode && (e.code === 'otp_disabled' || /signups not allowed/i.test(e.message ?? ''))) {
    return failure('email', error, e.status, 'auth.unknownAddress');
  }
  // The trigger refused the invite (race or expiry between the check and the request).
  if (inviteCode && e.status === 500) return failure('invite', error, e.status, 'auth.codeInvalid');
  return failure(inviteCode ? 'invite' : 'email', error, e.status, 'auth.error');
}

/** Signs in with the 6-digit code from the mail. Wrong, used and expired codes all read the same. */
export async function verifyCode(email: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (!error) return OK;
  return failure('code', error, asLike(error).status, 'auth.codeInvalid');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
