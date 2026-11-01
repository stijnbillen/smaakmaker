import { supabase } from './supabase';

export interface InviteRow {
  code: string;
  /** Key value from the database; the interface translates it. */
  status: 'open' | 'gebruikt' | 'verlopen';
  used_by_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteResult<T> {
  data: T | null;
  error: unknown;
  status: number;
}

export async function listInvites(): Promise<InviteResult<InviteRow[]>> {
  const { data, error, status } = await supabase.rpc('list_invites');
  return { data: error ? null : (data as InviteRow[]), error, status };
}

export async function createInvite(): Promise<InviteResult<InviteRow>> {
  const { data, error, status } = await supabase.rpc('create_invite');
  const row = Array.isArray(data) ? data[0] : data;
  return { data: error ? null : (row as InviteRow), error, status };
}
