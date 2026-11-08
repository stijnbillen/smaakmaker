import { createClient } from '@supabase/supabase-js';
import type { Language } from '../i18n/language';
import type { TextKey } from '../i18n/t';
import { supabase } from './supabase';
import { isValidEmail } from './validation';

export interface InvitationRow {
  email: string;
  sent_at: string;
  expires_at: string;
}

export interface InviteResult<T> {
  data: T | null;
  error: unknown;
  status: number;
}

export type InviteMessage = Extract<
  TextKey,
  'invites.invalidEmail' | 'invites.alreadyMember' | 'invites.rateLimited' | 'invites.mailFailed' | 'invites.error'
>;

export interface SendOutcome {
  ok: boolean;
  /** Normalised address that was invited. */
  email: string;
  /** Text key for the message when `ok` is false. */
  message?: InviteMessage;
  /** The raw database error, so the screen can tell a connection problem from a refusal. */
  cause?: unknown;
  status?: number;
}

// Error codes raised by the database functions (supabase/migrations/20261108100000_email_invitations.sql).
const CODE_INVALID_EMAIL = 'IV001';
const CODE_ALREADY_MEMBER = 'IV002';
const CODE_RATE_LIMITED = 'IV003';

/** Same normalisation as the database: surrounding whitespace is ignored, capitals make no difference. */
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export async function listInvitations(): Promise<InviteResult<InvitationRow[]>> {
  const { data, error, status } = await supabase.rpc('list_invitations');
  return { data: error ? null : (data as InvitationRow[]), error, status };
}

/**
 * Sends the login mail through the public Auth endpoint, from the browser of the administrator.
 * A separate client without storage: signInWithOtp must never touch the session of the administrator.
 * Whoever calls this endpoint without an invitation gets nothing: the trigger on auth.users refuses the account.
 */
async function sendMail(email: string, lang: Language): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const mailer = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
      storageKey: 'smaakmaker-invite-mailer',
    },
  });
  const { error } = await mailer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { lang }, emailRedirectTo: `${globalThis.location?.origin ?? ''}/` },
  });
  return !error;
}

function messageFor(error: { code?: string } | null): InviteMessage {
  switch (error?.code) {
    case CODE_INVALID_EMAIL:
      return 'invites.invalidEmail';
    case CODE_ALREADY_MEMBER:
      return 'invites.alreadyMember';
    case CODE_RATE_LIMITED:
      return 'invites.rateLimited';
    default:
      return 'invites.error';
  }
}

async function send(fn: 'invite_user' | 'resend_invitation', rawEmail: string, lang: Language): Promise<SendOutcome> {
  const email = normalizeEmail(rawEmail);
  // Checked first, so an invalid address never reaches the database or the mail endpoint.
  if (!isValidEmail(email)) return { ok: false, email, message: 'invites.invalidEmail' };

  // The database first: it checks the rights, counts the limit and records the invitation.
  const { error, status } = await supabase.rpc(fn, { p_email: email, p_lang: lang });
  if (error) return { ok: false, email, message: messageFor(error), cause: error, status };

  // A failed mail leaves the invitation (and the attempt in the count); the administrator can mail again.
  if (!(await sendMail(email, lang))) return { ok: false, email, message: 'invites.mailFailed' };
  return { ok: true, email };
}

export const inviteUser = (email: string, lang: Language): Promise<SendOutcome> => send('invite_user', email, lang);

export const resendInvitation = (email: string, lang: Language): Promise<SendOutcome> =>
  send('resend_invitation', email, lang);

export async function revokeInvitation(email: string): Promise<InviteResult<null>> {
  const { error, status } = await supabase.rpc('revoke_invitation', { p_email: normalizeEmail(email) });
  return { data: null, error, status };
}
