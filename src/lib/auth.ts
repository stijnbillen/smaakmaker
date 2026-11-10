import { getLanguage } from '../i18n/language';
import type { TextKey } from '../i18n/t';
import { isConnectionError } from './connection';
import { supabase } from './supabase';

export type AuthField = 'email' | 'code';

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
 * The database decides first whether a mail may go out: members and open invitations only.
 */
export async function requestCode(email: string): Promise<AuthResult> {
  const address = email.trim().toLowerCase();

  const check = await supabase.rpc('sign_in_status', { p_email: address });
  if (check.error) return failure('email', check.error, check.status, 'auth.error');
  if (check.data === 'unknown') return failure('email', null, undefined, 'auth.unknownAddress');
  const invited = check.data === 'invited';

  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: {
      shouldCreateUser: invited,
      ...(invited ? { data: { lang: getLanguage() } } : {}),
      // Opened from the mail: a plain link back to the app (implicit flow, works in any browser).
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (!error) return OK;

  const e = asLike(error);
  // A 500 is the trigger refusing (invitation expired or revoked since the check), but only
  // for an invited address. For a member a 500 is a mail failure (SMTP), so it stays a plain error.
  if (e.code === 'otp_disabled' || (invited && e.status === 500) || /signups not allowed/i.test(e.message ?? '')) {
    return failure('email', error, e.status, 'auth.unknownAddress');
  }
  return failure('email', error, e.status, 'auth.error');
}

/** Signs in with the 6-digit code from the mail. Wrong, used and expired codes all read the same. */
export async function verifyCode(email: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (!error) return OK;
  return failure('code', error, asLike(error).status, 'auth.codeInvalid');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
