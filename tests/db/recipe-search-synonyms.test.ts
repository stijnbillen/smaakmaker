import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-024 / R-021 against the local Supabase: search_recipes finds catalogue items by name or synonym (via item_key),
// and search_term_info(p_terms, p_lang) reports the item or a "did you mean" suggestion per term.
// Each test has its own letters-only suffix `s` in titles and looks only at its own recipe ids.
const INVALID_PARAMETER = '22023';
const NO_PRIVILEGE = '42501';

const lit = (x: string) => `'${x.replace(/'/g, "''")}'`;

interface Hit {
  id: string;
  match_count: number;
  term_count: number;
  [key: string]: unknown;
}

interface TermInfoRow {
  term: string;
  item_id: string | null;
  suggestion_id: string | null;
  suggestion_name: string | null;
}

describe('search_recipes with the catalogue (R-021)', () => {
  let u: TestUser;
  let s = '';
  const mine: string[] = [];
  const itemIds: Record<string, string> = {};

  const keyId = async (key: string) =>
    (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = ${lit(key)}`))[0].id;

  beforeAll(async () => {
    await assertSupabaseUp();
    u = await createTestUser('rsyn', { displayName: 'Sam Synoniem' });
    for (const key of ['broccoli', 'tomaat', 'aardappel', 'paprika', 'zout']) itemIds[key] = await keyId(key);
  });

  afterAll(async () => {
    if (mine.length > 0) await adminClient().from('recipes').delete().in('id', mine);
    if (u) await deleteTestUser(u);
  });

  beforeEach(() => {
    s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  });

  type Line = { name: string; ingredient_id?: string; size?: string };

  async function make(label: string, lines: Line[]) {
    const row = await insertRecipe(u.client, {
      title: `${label} ${s}`,
      ingredients: lines.map((l) => ({ quantity: 1, unit: 'stuk', ...l })),
    });
    mine.push(row.id);
    return row;
  }

  const search = (terms: unknown[], without: unknown[] = [], min: number | null = null) =>
    u.client.rpc('search_recipes', { p_terms: terms, p_without: without, p_min: min });

  async function ownHits(ids: string[], terms: unknown[], without: unknown[] = [], min: number | null = null): Promise<Hit[]> {
    const res = await search(terms, without, min);
    expect(res.error).toBeNull();
    return ((res.data ?? []) as Hit[]).filter((h) => ids.includes(h.id));
  }

  const sorted = (hits: Hit[]) => hits.map((h) => h.id).sort();

  describe('crit. 1: an exact term finds the item, in both languages and whatever the format', () => {
    it('"brocoli" finds the linked line (large), the linked line with another name, and the free old line "Brocolli"', async () => {
      const a = await make('A', [{ name: 'broccoli', ingredient_id: itemIds.broccoli, size: 'large' }]);
      const b = await make('B', [{ name: `groene roosjes ${s}`, ingredient_id: itemIds.broccoli }]);
      const c = await make('C', [{ name: 'Brocolli' }]);
      const decoy = await make('Decoy', [{ name: 'tomatensaus' }]);
      const hits = await ownHits([a.id, b.id, c.id, decoy.id], ['brocoli'], [], 1);
      expect(sorted(hits)).toEqual([a.id, b.id, c.id].sort());
      expect(hits.every((h) => h.match_count === 1 && h.term_count === 1)).toBe(true);
    });

    it('"tomate" (French) finds a recipe with the linked tomato line', async () => {
      const a = await make('A', [{ name: `rode ronde ${s}`, ingredient_id: itemIds.tomaat }]);
      const hits = await ownHits([a.id], ['tomate'], [], 1);
      expect(hits.map((h) => h.id)).toEqual([a.id]);
    });

    it('"pomme de terre" and "aardappel" give the same recipe', async () => {
      const a = await make('A', [{ name: `knol ${s}`, ingredient_id: itemIds.aardappel }]);
      const fr = await ownHits([a.id], ['pomme de terre'], [], 1);
      const nl = await ownHits([a.id], ['aardappel'], [], 1);
      expect(fr.map((h) => h.id)).toEqual([a.id]);
      expect(nl.map((h) => h.id)).toEqual([a.id]);
    });
  });

  describe('crit. 2: the old part-of-the-name search stays', () => {
    it('"feta" still finds "fetakaas" and "Feta", "creme" finds "Crème fraîche" (free text)', async () => {
      const a = await make('A', [{ name: `fetakaas${s}` }]);
      const b = await make('B', [{ name: `Feta${s}` }]);
      const c = await make('C', [{ name: `Crème fraîche ${s}` }]);
      // Plain part-of-name terms; other tests' recipes are ignored by ownHits (filter on own ids).
      expect(sorted(await ownHits([a.id, b.id, c.id], ['feta'], [], 1))).toEqual([a.id, b.id].sort());
      expect(sorted(await ownHits([a.id, b.id, c.id], ['creme'], [], 1))).toEqual([c.id]);
    });

    it('"pomme" finds a line called "aardappel" that is linked to potato (part of the current item name, French)', async () => {
      const a = await make('A', [{ name: 'aardappel', ingredient_id: itemIds.aardappel }]);
      const hits = await ownHits([a.id], ['pomme'], [], 1);
      expect(hits.map((h) => h.id)).toEqual([a.id]);
    });
  });

  describe('crit. 4: "zonder" recognises items the same way', () => {
    it('without "brocoli" drops recipes (a), (b) and (c) and keeps one without broccoli', async () => {
      const a = await make('A', [{ name: 'broccoli', ingredient_id: itemIds.broccoli }]);
      const b = await make('B', [{ name: `groene roosjes ${s}`, ingredient_id: itemIds.broccoli }]);
      const c = await make('C', [{ name: 'Brocolli' }]);
      const keep = await make('Keep', [{ name: `rijst ${s}` }]);
      const hits = await ownHits([a.id, b.id, c.id, keep.id], [], ['brocoli']);
      expect(hits.map((h) => h.id)).toEqual([keep.id]);
    });

    it('a part of the name still excludes: "creme" excludes "Crème fraîche"', async () => {
      const a = await make('A', [{ name: `Crème fraîche ${s}` }]);
      const keep = await make('Keep', [{ name: `rijst ${s}` }]);
      const hits = await ownHits([a.id, keep.id], [], ['creme']);
      expect(hits.map((h) => h.id)).toEqual([keep.id]);
    });
  });

  describe('crit. 5: two terms for the same item count as one', () => {
    it('["broccoli","brocoli"] gives term_count 1 and match_count 1', async () => {
      const a = await make('A', [{ name: 'broccoli', ingredient_id: itemIds.broccoli }]);
      const hits = await ownHits([a.id], ['broccoli', 'brocoli']);
      expect(hits).toHaveLength(1);
      expect(hits[0].term_count).toBe(1);
      expect(hits[0].match_count).toBe(1);
    });

    it('p_min = 2 with those two terms gives no error: k is brought down to n = 1', async () => {
      const a = await make('A', [{ name: 'broccoli', ingredient_id: itemIds.broccoli }]);
      const res = await search(['broccoli', 'brocoli'], [], 2);
      expect(res.error).toBeNull();
      expect(((res.data ?? []) as Hit[]).map((h) => h.id)).toContain(a.id);
    });

    it('a p_min above the number of unique keys is still refused (22023)', async () => {
      const res = await search([`feta${s}`, `tomaat${s}`], [], 3);
      expect(res.error?.code).toBe(INVALID_PARAMETER);
    });
  });

  describe('crit. 6: results do not depend on the interface language', () => {
    it('the signature has no language parameter: (text[], text[], integer)', async () => {
      const rows = await sql<{ args: string }>(
        `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'search_recipes'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].args.replace(/\s+/g, ' ')).toMatch(/^p_terms text\[\], p_without text\[\], p_min integer$/);
    });
  });

  describe('crit. 7: the result type is unchanged', () => {
    it('still returns is_favorite and the overview columns, and can be filtered with PostgREST', async () => {
      const a = await make('A', [{ name: 'broccoli', ingredient_id: itemIds.broccoli }]);
      const res = await search(['brocoli'], [], 1).lte('prep_minutes', 15);
      expect(res.error).toBeNull();
      const hit = ((res.data ?? []) as Hit[]).find((h) => h.id === a.id);
      expect(hit).toBeDefined();
      for (const key of ['is_favorite', 'photos', 'family_id', 'rating_avg', 'rating_count', 'author_name', 'match_count', 'term_count']) {
        expect(Object.keys(hit!), key).toContain(key);
      }
    });
  });
});

describe('search_term_info (R-021 crit. 3)', () => {
  let u: TestUser;

  const info = (terms: unknown[], lang: string, client = u.client) =>
    client.rpc('search_term_info', { p_terms: terms, p_lang: lang });

  beforeAll(async () => {
    await assertSupabaseUp();
    u = await createTestUser('rterm');
  });

  afterAll(async () => {
    if (u) await deleteTestUser(u);
  });

  it('paprica: no item and the suggestion paprika; zout: an item and no suggestion; xqzv and bro: nothing', async () => {
    const res = await info(['paprica', 'zout', 'xqzv', 'bro'], 'nl');
    expect(res.error).toBeNull();
    const rows = (res.data ?? []) as TermInfoRow[];
    const by = (t: string) => rows.find((r) => r.term === t);
    const paprika = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'paprika'`))[0].id;
    const zout = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'zout'`))[0].id;

    expect(by('paprica')?.item_id ?? null).toBeNull();
    expect(by('paprica')?.suggestion_id).toBe(paprika);
    expect(by('paprica')?.suggestion_name).toBe('paprika');

    expect(by('zout')?.item_id).toBe(zout);
    expect(by('zout')?.suggestion_id ?? null).toBeNull();

    // "Nothing" = no row, or a row without item and without suggestion (too short, or only "begins with").
    for (const t of ['xqzv', 'bro']) {
      expect(by(t)?.item_id ?? null, t).toBeNull();
      expect(by(t)?.suggestion_id ?? null, t).toBeNull();
    }
  });

  it('in French the suggestion carries the French name', async () => {
    const res = await info(['paprica'], 'fr');
    expect(res.error).toBeNull();
    const row = ((res.data ?? []) as TermInfoRow[]).find((r) => r.term === 'paprica');
    expect(row?.suggestion_name).toBe('poivron');
  });

  it('an anonymous call is refused (42501)', async () => {
    const res = await info(['paprica'], 'nl', anonClient());
    expect(res.error?.code).toBe(NO_PRIVILEGE);
  });

  it('20 terms are accepted, 21 give 22023', async () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `qzvk${String.fromCharCode(97 + (i % 26))}${i}`);
    expect((await info(make(20), 'nl')).error).toBeNull();
    expect((await info(make(21), 'nl')).error?.code).toBe(INVALID_PARAMETER);
  });

  it('a language other than nl or fr gives 22023', async () => {
    expect((await info(['zout'], 'de')).error?.code).toBe(INVALID_PARAMETER);
  });
});
