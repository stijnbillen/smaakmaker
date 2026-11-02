import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-008 / R-015 crit. 1 against the local Supabase: the database enforces source and note.
const CHECK_VIOLATION = '23514';

describe('recipe source and note (R-015)', () => {
  let a: TestUser;
  let b: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('rsna');
    b = await createTestUser('rsnb');
    admin = await createTestUser('rsnadm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    for (const u of [a, b, admin]) if (u) await deleteTestUser(u);
  });

  const insert = (overrides: Record<string, unknown>) =>
    a.client.from('recipes').insert(validRecipe(overrides)).select('source,note').single();

  it('accepts an insert without source and note (both null)', async () => {
    const res = await insert({});
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ source: null, note: null });
  });

  it('accepts exactly 200 characters source and 1000 characters note', async () => {
    const res = await insert({ source: 'a'.repeat(200), note: 'b'.repeat(1000) });
    expect(res.error).toBeNull();
    expect(res.data?.source).toHaveLength(200);
    expect(res.data?.note).toHaveLength(1000);
  });

  it('refuses 201 characters source (recipes_source_len)', async () => {
    const res = await insert({ source: 'a'.repeat(201) });
    expect(res.error?.code).toBe(CHECK_VIOLATION);
    expect(res.error?.message).toContain('recipes_source_len');
  });

  it('refuses 1001 characters note (recipes_note_len)', async () => {
    const res = await insert({ note: 'b'.repeat(1001) });
    expect(res.error?.code).toBe(CHECK_VIOLATION);
    expect(res.error?.message).toContain('recipes_note_len');
  });

  it('stores whitespace-only values as null (optional also on a direct API call)', async () => {
    const res = await insert({ source: '   ', note: '   ' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ source: null, note: null });
  });

  it('trims surrounding spaces', async () => {
    const res = await insert({ source: '  abc  ', note: '  def  ' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ source: 'abc', note: 'def' });
  });

  it('accepts 200 characters with spaces around (length counts after trim)', async () => {
    const res = await insert({ source: `  ${'a'.repeat(200)}  `, note: `  ${'b'.repeat(1000)}  ` });
    expect(res.error).toBeNull();
    expect(res.data?.source).toHaveLength(200);
  });

  it('lets the author update source and note, with the same checks', async () => {
    const row = await insertRecipe(a.client);
    const upd = (values: Record<string, unknown>) =>
      a.client.from('recipes').update(values).eq('id', row.id).select('source,note');
    const ok = await upd({ source: 'Oma', note: 'Lekker' });
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ source: 'Oma', note: 'Lekker' }]);
    expect((await upd({ source: 'a'.repeat(201) })).error?.code).toBe(CHECK_VIOLATION);
    expect((await upd({ note: 'b'.repeat(1001) })).error?.code).toBe(CHECK_VIOLATION);
    const cleared = await upd({ source: '  ', note: null });
    expect(cleared.data).toEqual([{ source: null, note: null }]);
  });

  it('gives another user 0 rows on update and leaves the values unchanged', async () => {
    const row = await insertRecipe(a.client, { source: 'Oma', note: 'Lekker' });
    const res = await b.client.from('recipes').update({ source: 'x', note: 'y' }).eq('id', row.id).select('id');
    expect(res.data ?? []).toHaveLength(0);
    const check = await adminClient().from('recipes').select('source,note').eq('id', row.id).single();
    expect(check.data).toEqual({ source: 'Oma', note: 'Lekker' });
  });

  it('gives an administrator 0 rows on update too (only the author edits)', async () => {
    const row = await insertRecipe(a.client, { source: 'Oma', note: 'Lekker' });
    const res = await admin.client.from('recipes').update({ source: 'x', note: 'y' }).eq('id', row.id).select('id');
    expect(res.data ?? []).toHaveLength(0);
    const check = await adminClient().from('recipes').select('source,note').eq('id', row.id).single();
    expect(check.data).toEqual({ source: 'Oma', note: 'Lekker' });
  });
});
