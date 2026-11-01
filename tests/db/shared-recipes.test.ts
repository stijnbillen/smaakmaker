import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/supabase-admin';

// T-001 criterion 3 (database level) and the RLS basics from the task brief.
describe('shared recipes (R-001 crit. 3)', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('a');
    b = await createTestUser('b');
  });

  afterAll(async () => {
    if (a) await deleteTestUser(a);
    if (b) await deleteTestUser(b);
  });

  it('recipe saved by user A is visible to user B', async () => {
    const title = `Gedeeld recept ${Date.now()}`;
    const ins = await a.client.from('recipes').insert({ title }).select().single();
    expect(ins.error).toBeNull();
    expect(ins.data?.author_id).toBe(a.id);

    const res = await b.client.from('recipes').select('id,title').order('created_at', { ascending: false });
    expect(res.error).toBeNull();
    expect(res.data?.map((r) => r.title)).toContain(title);
  });

  it('rejects inserting a recipe in the name of another user (rows-level rule)', async () => {
    const res = await a.client.from('recipes').insert({ title: 'Vervalst', author_id: b.id });
    expect(res.error).not.toBeNull();
  });

  it('gives anonymous visitors no access', async () => {
    const anon = anonClient();
    const read = await anon.from('recipes').select('id');
    // either an error or an empty list: nothing may leak
    expect(read.data ?? []).toHaveLength(0);
    const write = await anon.from('recipes').insert({ title: 'Anoniem' });
    expect(write.error).not.toBeNull();
  });

  it('does not let another user edit or delete a recipe yet (R-003/R-017 open it later)', async () => {
    const ins = await a.client.from('recipes').insert({ title: 'Niet aanraken' }).select().single();
    const id = ins.data!.id;
    await b.client.from('recipes').update({ title: 'Gehackt' }).eq('id', id);
    await b.client.from('recipes').delete().eq('id', id);
    const check = await a.client.from('recipes').select('title').eq('id', id).single();
    expect(check.data?.title).toBe('Niet aanraken');
  });
});
