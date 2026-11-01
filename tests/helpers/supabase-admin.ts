// Test-only helper. The service key lives here and must never be imported from src/
// (T-001 criterion 7: no secret keys in the client).
import { execSync } from 'node:child_process';
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

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Client signed in as this user, using only the public key. */
  client: SupabaseClient;
  session: Session;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('sign-in failed');
  return { id: created.data.user.id, email, password, client, session: signedIn.data.session };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const admin = adminClient();
  // recipes.author_id references auth.users; remove rows first in case there is no cascade.
  await admin.from('recipes').delete().eq('author_id', user.id);
  await admin.auth.admin.deleteUser(user.id);
}
