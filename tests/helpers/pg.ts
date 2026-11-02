// Test-only: direct SQL against the LOCAL database (port 54322) through a pg client.
// Only for things the public API cannot do (pure function checks, back-dating a sent code).
// Values come from tests, never from users.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Test weigert te starten: databank (${host}) is niet lokaal`);
  }
}

export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  assertLocal(DB_URL);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const res = await client.query(query);
    return (res.rows ?? []) as T[];
  } finally {
    await client.end();
  }
}

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export async function userExists(email: string): Promise<boolean> {
  return (await sql(`select id from auth.users where email = ${lit(email)}`)).length > 0;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ id: string }>(`select id from auth.users where email = ${lit(email)}`);
  return rows[0]?.id ?? null;
}

/** otp_expiry (seconds) from supabase/config.toml; falls back to the Supabase default. */
export function otpExpirySeconds(): number {
  const toml = readFileSync('supabase/config.toml', 'utf8');
  const m = /^\s*otp_expiry\s*=\s*(\d+)/m.exec(toml);
  return m ? Number(m[1]) : 3600;
}

/**
 * Makes every code sent to this user look as if it was sent `otp_expiry + 60 s` ago.
 * The sent-at column differs per GoTrue version, so all of them are moved.
 */
export async function backdateCodes(email: string): Promise<void> {
  const secs = otpExpirySeconds() + 60;
  const interval = `interval '${secs} seconds'`;
  await sql(
    `update auth.users set
       confirmation_sent_at = confirmation_sent_at - ${interval},
       recovery_sent_at = recovery_sent_at - ${interval},
       email_change_sent_at = email_change_sent_at - ${interval},
       reauthentication_sent_at = reauthentication_sent_at - ${interval}
     where email = ${lit(email)}`,
  );
  try {
    await sql(
      `update auth.one_time_tokens set created_at = created_at - ${interval}
       where user_id in (select id from auth.users where email = ${lit(email)})`,
    );
  } catch {
    // table absent in older GoTrue versions: the columns above are then the source of truth
  }
}

/** Calls the pure validity function; `offset` is an SQL interval added to the invite's created_at. */
export async function inviteValidAt(code: string, offset: string): Promise<boolean> {
  const rows = await sql<{ v: boolean }>(
    `select public.invite_is_valid_at(code, created_at + interval ${lit(offset)}) as v
     from public.invites where code = ${lit(code)}`,
  );
  if (rows.length !== 1) throw new Error(`invite ${code} niet gevonden`);
  return rows[0].v;
}

/**
 * T-013: sets storage.objects.metadata.size of a stored photo (local database only; assertLocal in sql()).
 * Real photos are at most 512000 bytes, so only this makes a recipe reach the 2 MB limit.
 * `bytes: null` removes the size key (a file without a known size).
 */
export async function setPhotoSize(path: string, bytes: number | null): Promise<void> {
  const rows = await sql<{ id: string }>(
    bytes === null
      ? `update storage.objects set metadata = metadata - 'size' where bucket_id = 'recipe-photos' and name = ${lit(path)} returning id`
      : `update storage.objects set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{size}', to_jsonb(${Math.trunc(bytes)}::bigint))
         where bucket_id = 'recipe-photos' and name = ${lit(path)} returning id`,
  );
  if (rows.length !== 1) throw new Error(`photo ${path} not found in storage.objects`);
}

export async function inviteValidAtUnknown(code: string): Promise<boolean> {
  const rows = await sql<{ v: boolean }>(`select public.invite_is_valid_at(${lit(code)}, now()) as v`);
  return rows[0].v;
}
