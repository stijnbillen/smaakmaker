// Test-only helper. The service key lives here and must never be imported from src/
// (T-001 criterion 7: no secret keys in the client).
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export const NOT_REACHABLE_MESSAGE = 'Lokale Supabase niet bereikbaar; draai `supabase start`';

interface LocalConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cached: LocalConfig | undefined;

function readFromSupabaseStatus(): Record<string, string> {
  try {
    const out = execSync('supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const values: Record<string, string> = {};
    for (const line of out.split(/\r?\n/)) {
      const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
      if (m) values[m[1]] = m[2];
    }
    return values;
  } catch {
    return {};
  }
}

export function getLocalConfig(): LocalConfig {
  if (cached) return cached;
  const status =
    process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {}
      : readFromSupabaseStatus();
  const url = process.env.VITE_SUPABASE_URL ?? status.API_URL ?? 'http://127.0.0.1:54321';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? status.ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) throw new Error(NOT_REACHABLE_MESSAGE);

  // Safety: tests never talk to a cloud project.
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Test weigert te starten: VITE_SUPABASE_URL (${url}) wijst niet naar localhost/127.0.0.1`);
  }
  cached = { url, anonKey, serviceKey };
  return cached;
}

export const supabaseUrl = (): string => getLocalConfig().url;
export const anonKey = (): string => getLocalConfig().anonKey;
export const serviceKey = (): string => getLocalConfig().serviceKey;

export async function assertSupabaseUp(): Promise<void> {
  const { url, anonKey: key } = getLocalConfig();
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch {
    throw new Error(NOT_REACHABLE_MESSAGE);
  }
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  const { url, serviceKey: key } = getLocalConfig();
  return createClient(url, key, noPersist);
}

export function anonClient(): SupabaseClient {
  const { url, anonKey: key } = getLocalConfig();
  return createClient(url, key, noPersist);
}

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

// T-027 / R-027: invitations are per e-mail address (the invite codes of T-003 are gone).
// The tables are closed for anon and authenticated, so tests prepare and read them with the service client.

/** Invitation row as the database stores it (only the columns the tests read). */
export interface InvitationRow {
  email: string;
  invited_by: string | null;
  lang: string | null;
  sent_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

/** Normalised address, the way the database stores it. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Puts an invitation row in place through the service client.
 * `sentAt` back-dates it (validity runs 7 days from there).
 */
export async function createInvitation(
  email: string,
  opts: { sentAt?: Date; invitedBy?: string; lang?: 'nl' | 'fr' } = {},
): Promise<void> {
  const row: Record<string, unknown> = { email: normalizeEmail(email) };
  if (opts.sentAt) row.sent_at = opts.sentAt.toISOString();
  if (opts.invitedBy) row.invited_by = opts.invitedBy;
  if (opts.lang) row.lang = opts.lang;
  const ins = await adminClient().from('invitations').insert(row);
  if (ins.error) throw ins.error;
}

/** Reads one invitation (or null) with the service client. */
export async function getInvitation(email: string): Promise<InvitationRow | null> {
  const res = await adminClient()
    .from('invitations')
    .select('email,invited_by,lang,sent_at,accepted_at,accepted_by')
    .eq('email', normalizeEmail(email))
    .maybeSingle();
  if (res.error) throw res.error;
  return (res.data as InvitationRow | null) ?? null;
}

/** Moves the `sent_at` of an invitation (service role), to test the 7-day edge. */
export async function setInvitationSentAt(email: string, sentAt: Date): Promise<void> {
  const upd = await adminClient()
    .from('invitations')
    .update({ sent_at: sentAt.toISOString() })
    .eq('email', normalizeEmail(email))
    .select('email');
  if (upd.error) throw upd.error;
  if ((upd.data ?? []).length !== 1) throw new Error(`invitation for ${email} not found`);
}

/** Number of rows in invitation_sends for an administrator (the 20-per-24-hours counter). */
export async function countInvitationSends(adminId: string): Promise<number> {
  const res = await adminClient().from('invitation_sends').select('id', { count: 'exact', head: true }).eq('admin_id', adminId);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

/** Number of invitation_sends rows for an address. */
export async function countSendsTo(email: string): Promise<number> {
  const res = await adminClient()
    .from('invitation_sends')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizeEmail(email));
  if (res.error) throw res.error;
  return res.count ?? 0;
}

/** Number of rows in invitations (service role). */
export async function countInvitations(): Promise<number> {
  const res = await adminClient().from('invitations').select('email', { count: 'exact', head: true });
  if (res.error) throw res.error;
  return res.count ?? 0;
}

/** Fills the send counter of an administrator: `count` sends, all made at `sentAt` (default: now). */
export async function seedInvitationSends(adminId: string, count: number, sentAt: Date = new Date()): Promise<void> {
  const rows = Array.from({ length: count }, () => ({
    admin_id: adminId,
    email: uniqueEmail('seed'),
    sent_at: sentAt.toISOString(),
  }));
  const ins = await adminClient().from('invitation_sends').insert(rows);
  if (ins.error) throw ins.error;
}

/** The mail request the app's invite mailer does: public key only, creates the user when an invitation exists. */
export function requestInviteMail(email: string, lang: 'nl' | 'fr' = 'nl') {
  return anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { lang } } });
}

/**
 * T-028: the request the sign-in screen does (src/lib/auth.ts requestCode), with the public key only:
 * ask `sign_in_status`, send no mail for 'unknown', otherwise ask GoTrue (a user is only created for 'invited').
 * Returns the status the database gave, and the GoTrue error if there was one.
 */
export async function requestCode(
  email: string,
  lang: 'nl' | 'fr' = 'nl',
): Promise<{ status: string; error: { message: string } | null }> {
  const address = normalizeEmail(email);
  const client = anonClient();
  const check = await client.rpc('sign_in_status', { p_email: address });
  if (check.error) throw check.error;
  const status = String(check.data);
  if (status === 'unknown') return { status, error: null };
  const invited = status === 'invited';
  const res = await client.auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: invited, ...(invited ? { data: { lang } } : {}) },
  });
  return { status, error: res.error };
}

/** Calls an invitation function as the given signed-in (or anonymous) client. Parameter names: p_email, p_lang. */
export function inviteRpc(
  client: SupabaseClient,
  fn: 'invite_user' | 'resend_invitation',
  email: string,
  lang: 'nl' | 'fr' = 'nl',
) {
  return client.rpc(fn, { p_email: email, p_lang: lang });
}

/** Removes invitations and send records for addresses (cleanup; the users themselves are removed elsewhere). */
export async function deleteInvitations(emails: string[]): Promise<void> {
  const list = emails.map(normalizeEmail);
  if (list.length === 0) return;
  const admin = adminClient();
  await admin.from('invitation_sends').delete().in('email', list);
  await admin.from('invitations').delete().in('email', list);
}

/** Makes a user administrator the way the app never can: a direct insert with the service client. */
export async function makeAdmin(userId: string): Promise<void> {
  const ins = await adminClient().from('admins').upsert({ user_id: userId });
  if (ins.error) throw ins.error;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string | null;
  /** Client signed in as this user, using only the public key. */
  client: SupabaseClient;
  session: Session;
}

/**
 * Creates a confirmed user the way the invite trigger demands (an invitation row for the address;
 * a user created already confirmed accepts it at once).
 * `displayName: null` gives a user who has not chosen a name yet (lands on /welkom).
 */
export async function createTestUser(
  label: string,
  opts: { displayName?: string | null } = {},
): Promise<TestUser> {
  const admin = adminClient();
  const email = uniqueEmail(label);
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  await createInvitation(email);
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
  const displayName = opts.displayName === undefined ? `Test ${label}` : opts.displayName;
  if (displayName !== null) {
    const upd = await admin.from('profiles').update({ display_name: displayName }).eq('id', created.data.user.id);
    if (upd.error) throw upd.error;
  }
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('sign-in failed');
  return {
    id: created.data.user.id,
    email,
    password,
    displayName,
    client,
    session: signedIn.data.session,
  };
}

/** A minimal valid recipe row (R-003: 1 ingredient, 1 step); overrides replace single fields. */
export function validRecipe(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: `Testrecept ${Date.now()}`,
    ingredients: [{ name: 'Zout' }],
    steps: ['Meng alles.'],
    // T-006 / R-007: both times are required; valid defaults keep older tests working.
    prep_minutes: 10,
    total_minutes: 20,
    // T-007 / R-013: servings are required (1..99).
    servings: 4,
    ...overrides,
  };
}

export interface StoredRecipe {
  id: string;
  title: string;
  author_id: string;
  created_at: string;
}

/** Inserts a valid recipe as the given (signed-in) client and returns the stored row. Throws on a database error. */
export async function insertRecipe(
  client: SupabaseClient,
  overrides: Record<string, unknown> = {},
): Promise<StoredRecipe> {
  const res = await client.from('recipes').insert(validRecipe(overrides)).select('id,title,author_id,created_at').single();
  if (res.error || !res.data) throw res.error ?? new Error('insertRecipe failed');
  return res.data as StoredRecipe;
}

export const PHOTO_BUCKET = 'recipe-photos';

/** Bytes that look like a JPEG to the bucket (type is taken from the upload, not sniffed). */
export function fakeJpegBytes(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

/**
 * Uploads a small JPEG to `<recipeId>/<uuid>.jpg` as the given signed-in client (T-012 / R-005).
 * Returns the storage path. Errors are returned, not thrown, so tests can assert on refusals.
 */
export async function uploadTestPhoto(
  client: SupabaseClient,
  recipeId: string,
  opts: { size?: number; contentType?: string; path?: string } = {},
): Promise<{ path: string; error: { message: string } | null }> {
  const path = opts.path ?? `${recipeId}/${randomUUID()}.jpg`;
  const res = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, fakeJpegBytes(opts.size), { contentType: opts.contentType ?? 'image/jpeg', upsert: false });
  return { path, error: res.error };
}

/** Names of the files in a recipe's folder, read with the service client. */
export async function listRecipeFiles(recipeId: string): Promise<string[]> {
  const res = await adminClient().storage.from(PHOTO_BUCKET).list(recipeId);
  if (res.error) throw res.error;
  return (res.data ?? []).map((f) => f.name).filter((name) => name !== '.emptyFolderPlaceholder');
}

/** Removes a recipe's folder through the Storage API (a SQL delete on storage.objects is blocked). */
export async function removeRecipeFiles(recipeId: string): Promise<void> {
  const names = await listRecipeFiles(recipeId).catch(() => [] as string[]);
  if (names.length > 0) await adminClient().storage.from(PHOTO_BUCKET).remove(names.map((n) => `${recipeId}/${n}`));
}

/**
 * T-014: copies stored photos into the folder of `newRecipeId` through the Storage API with the given
 * user's session (what the app does). Returns the new photos list, same order and main flag.
 */
export async function copyPhotos(
  client: SupabaseClient,
  photos: { path: string; main: boolean }[],
  newRecipeId: string,
): Promise<{ path: string; main: boolean }[]> {
  const out: { path: string; main: boolean }[] = [];
  for (const p of photos) {
    const to = `${newRecipeId}/${randomUUID()}.jpg`;
    const res = await client.storage.from(PHOTO_BUCKET).copy(p.path, to);
    if (res.error) throw res.error;
    out.push({ path: to, main: p.main });
  }
  return out;
}

/**
 * T-014: inserts a variant of `sourceId` as the given client (PostgREST). Fields are valid defaults;
 * `overrides` can replace anything, including `variant_of` and `author_id`.
 */
export async function insertVariant(
  client: SupabaseClient,
  sourceId: string,
  overrides: Record<string, unknown> = {},
): Promise<StoredRecipe & { variant_of: string | null; family_id: string }> {
  const res = await client
    .from('recipes')
    .insert(validRecipe({ variant_of: sourceId, ...overrides }))
    .select('id,title,author_id,created_at,variant_of,family_id')
    .single();
  if (res.error || !res.data) throw res.error ?? new Error('insertVariant failed');
  return res.data as StoredRecipe & { variant_of: string | null; family_id: string };
}

/** T-013: see pg.ts. Re-exported so size tests import all storage helpers from one place. */
export { setPhotoSize } from './pg';

export async function deleteTestUser(user: TestUser): Promise<void> {
  const admin = adminClient();
  // Photo folders first: the recipe rows tell which folders belong to this user.
  const mine = await admin.from('recipes').select('id').eq('author_id', user.id);
  for (const row of mine.data ?? []) await removeRecipeFiles((row as { id: string }).id);
  // recipes.author_id references auth.users; remove rows first in case there is no cascade.
  await admin.from('recipes').delete().eq('author_id', user.id);
  await admin.from('invitation_sends').delete().eq('admin_id', user.id);
  await admin.auth.admin.deleteUser(user.id);
  await deleteInvitations([user.email]);
}
