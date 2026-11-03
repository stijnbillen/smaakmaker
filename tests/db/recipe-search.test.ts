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

// T-015 / R-009 against the local Supabase: search_recipes(p_terms, p_without, p_min).
// Every test gets its own letters-only suffix `s` in titles and ingredient names, and looks only at its own recipe ids,
// so leftovers of other tests or files cannot change the outcome. No catalogue rows are created ('Pan' exists).
const INVALID_PARAMETER = '22023';
const NO_PRIVILEGE = '42501';

interface Hit {
  id: string;
  title: string;
  created_at: string;
  prep_minutes: number | null;
  equipment: string[];
  match_count: number;
  term_count: number;
  photos: unknown;
  family_id: string | null;
  rating_avg: number | string | null;
  rating_count: number;
  author_name: string | null;
}

describe('search_recipes (R-009)', () => {
  let u: TestUser;
  let s = '';
  const mine: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    u = await createTestUser('rsearch', { displayName: 'Sam Zoeker' });
  });

  afterAll(async () => {
    // Cleanup by id.
    if (mine.length > 0) await adminClient().from('recipes').delete().in('id', mine);
    if (u) await deleteTestUser(u);
  });

  beforeEach(() => {
    s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  });

  /** Inserts a recipe with the given ingredient names (quantity is a number, as the check demands). */
  async function make(label: string, names: string[], extra: Record<string, unknown> = {}) {
    const row = await insertRecipe(u.client, {
      title: `${label} ${s}`,
      ingredients: names.map((name) => ({ name, quantity: 1, unit: 'stuk' })),
      ...extra,
    });
    mine.push(row.id);
    return row;
  }

  function search(terms: unknown[], without: unknown[] = [], min: number | null = null) {
    return u.client.rpc('search_recipes', { p_terms: terms, p_without: without, p_min: min });
  }

  /** Hits of this test only, in the order the database returned them. */
  async function ownHits(ids: string[], terms: unknown[], without: unknown[] = [], min: number | null = null): Promise<Hit[]> {
    const res = await search(terms, without, min);
    expect(res.error).toBeNull();
    return ((res.data ?? []) as Hit[]).filter((h) => ids.includes(h.id));
  }

  describe('crit. 1: one term finds recipes with an ingredient name that contains it', () => {
    it('"feta" finds "fetakaas" and "Feta" but not the tomato-only recipe', async () => {
      const a = await make('A', [`fetakaas${s}`]);
      const b = await make('B', [`Feta${s}`]);
      const c = await make('C', [`tomaat${s}`]);
      const hits = await ownHits([a.id, b.id, c.id], ['feta'], [], 1);
      expect(hits.map((h) => h.id).sort()).toEqual([a.id, b.id].sort());
      expect(hits.every((h) => h.match_count === 1 && h.term_count === 1)).toBe(true);
    });

    it('ignores case and accents: "creme" and "CRÈME" both find "Crème fraîche"', async () => {
      const a = await make('A', [`Crème fraîche ${s}`]);
      for (const term of ['creme', 'CRÈME']) {
        const hits = await ownHits([a.id], [term], [], 1);
        expect(hits.map((h) => h.id), term).toEqual([a.id]);
      }
    });

    it('searches the ingredient name only, not steps, unit, title or note', async () => {
      const decoy = await insertRecipe(u.client, {
        title: `feta${s} in de titel`,
        ingredients: [{ name: `zout${s}`, quantity: 1, unit: `feta${s}` }],
        steps: [`Strooi feta${s} erover.`],
        note: `feta${s}`,
      });
      mine.push(decoy.id);
      const real = await make('Echt', [`feta${s}`]);
      const hits = await ownHits([decoy.id, real.id], [`feta${s}`], [], 1);
      expect(hits.map((h) => h.id)).toEqual([real.id]);
    });

    it('"%" and "_" are plain characters', async () => {
      const plain = await make('Gewoon', [`aardappel${s}`]);
      const percent = await make('Procent', [`100% sap ${s}`]);
      const under = await make('Streep', [`snel_gerecht ${s}`]);
      const ids = [plain.id, percent.id, under.id];
      expect((await ownHits(ids, ['%'], [], 1)).map((h) => h.id)).toEqual([percent.id]);
      expect((await ownHits(ids, ['_'], [], 1)).map((h) => h.id)).toEqual([under.id]);
    });
  });

  describe('crit. 2: 1..10 terms, at least k of n, each term counts at most once', () => {
    it('two ingredients that both contain the term count once: match_count 1 for ["feta","tomaat"], not 2', async () => {
      // Both names contain the term, so a per-ingredient count would give 2.
      const a = await make('A', [`feta${s}`, `feta${s} blokjes`]);
      const hits = await ownHits([a.id], [`feta${s}`, `tomaat${s}`], [], 1);
      expect(hits).toHaveLength(1);
      expect(hits[0].match_count).toBe(1);
      expect(hits[0].term_count).toBe(2);
    });

    it('with k = 2 a recipe whose two ingredients hit the same term is not a hit', async () => {
      const a = await make('A', [`feta${s}`, `gemarineerde feta${s}`]);
      const hits = await ownHits([a.id], [`feta${s}`, `tomaat${s}`], [], 2);
      expect(hits).toHaveLength(0);
    });

    it('terms equal without case and accents count as one term (n = 1)', async () => {
      const a = await make('A', [`Crème${s}`]);
      const hits = await ownHits([a.id], [`creme${s}`, `CRÈME${s}`, ` Creme${s} `]);
      expect(hits).toHaveLength(1);
      expect(hits[0].term_count).toBe(1);
      expect(hits[0].match_count).toBe(1);
    });

    it('by default k = n: only the recipe with both terms is a hit; with k = 1 single-term recipes join', async () => {
      const both = await make('Beide', [`feta${s}`, `tomaat${s}`]);
      const onlyFeta = await make('Feta', [`feta${s}`]);
      const onlyTomato = await make('Tomaat', [`tomaat${s}`]);
      const ids = [both.id, onlyFeta.id, onlyTomato.id];
      const terms = [`feta${s}`, `tomaat${s}`];
      expect((await ownHits(ids, terms)).map((h) => h.id)).toEqual([both.id]);
      expect((await ownHits(ids, terms, [], 2)).map((h) => h.id)).toEqual([both.id]);
      expect((await ownHits(ids, terms, [], 1)).map((h) => h.id).sort()).toEqual(ids.sort());
    });

    it('11 terms give error 22023 and no silent result', async () => {
      const res = await search(Array.from({ length: 11 }, (_, i) => `term${String.fromCharCode(97 + i)}${s}`));
      expect(res.error?.code).toBe(INVALID_PARAMETER);
      expect(res.data ?? null).toBeNull();
    });

    it('10 terms are accepted', async () => {
      const res = await search(Array.from({ length: 10 }, (_, i) => `term${String.fromCharCode(97 + i)}${s}`), [], 1);
      expect(res.error).toBeNull();
    });

    it('a minimum outside 1..n gives 22023', async () => {
      const terms = [`feta${s}`, `tomaat${s}`];
      expect((await search(terms, [], 0)).error?.code).toBe(INVALID_PARAMETER);
      expect((await search(terms, [], 3)).error?.code).toBe(INVALID_PARAMETER);
      expect((await search(terms, [], -1)).error?.code).toBe(INVALID_PARAMETER);
      expect((await search(terms, [], 2)).error).toBeNull();
    });
  });

  describe('crit. 3: {feta, tomaat, olijf, ui, look} with k = 3', () => {
    it('feta + tomaat + ui is a hit, feta + tomaat is not; a recipe with all five has match_count 5', async () => {
      // Suffix on every term: the real words "ui" and "look" would also hit "fruit" and "knoflook".
      const t = ['feta', 'tomaat', 'olijf', 'ui', 'look'].map((x) => `${x}${s}`);
      const three = await make('Drie', [t[0], t[1], t[3]]);
      const two = await make('Twee', [t[0], t[1]]);
      const five = await make('Vijf', t);
      const hits = await ownHits([three.id, two.id, five.id], t, [], 3);
      expect(hits.map((h) => h.id).sort()).toEqual([three.id, five.id].sort());
      expect(hits.find((h) => h.id === five.id)?.match_count).toBe(5);
      expect(hits.find((h) => h.id === three.id)?.match_count).toBe(3);
      expect(hits.every((h) => h.term_count === 5)).toBe(true);
    });
  });

  describe('crit. 4: "zonder"', () => {
    it('drops the recipe with feta and ui, keeps the one with feta only', async () => {
      const withOnion = await make('Met ui', [`feta${s}`, `ui${s}`]);
      const without = await make('Zonder ui', [`feta${s}`]);
      const hits = await ownHits([withOnion.id, without.id], [`feta${s}`], [`ui${s}`], 1);
      expect(hits.map((h) => h.id)).toEqual([without.id]);
    });

    it('also drops a recipe that meets the minimum', async () => {
      const a = await make('A', [`feta${s}`, `tomaat${s}`, `ui${s}`]);
      const hits = await ownHits([a.id], [`feta${s}`, `tomaat${s}`], [`ui${s}`], 2);
      expect(hits).toHaveLength(0);
    });

    it('ignores accents: "creme" excludes "Crème fraîche"', async () => {
      const a = await make('A', [`feta${s}`, `Crème fraîche ${s}`]);
      const b = await make('B', [`feta${s}`]);
      const hits = await ownHits([a.id, b.id], [`feta${s}`], ['creme'], 1);
      expect(hits.map((h) => h.id)).toEqual([b.id]);
    });

    it('11 without-terms give 22023', async () => {
      const res = await search([`feta${s}`], Array.from({ length: 11 }, (_, i) => `zonder${String.fromCharCode(97 + i)}${s}`), 1);
      expect(res.error?.code).toBe(INVALID_PARAMETER);
    });

    it('without terms only: every recipe except the excluded one, with match_count 0', async () => {
      const a = await make('A', [`feta${s}`, `ui${s}`]);
      const b = await make('B', [`feta${s}`]);
      const c = await make('C', [`tomaat${s}`]);
      const hits = await ownHits([a.id, b.id, c.id], [], [`ui${s}`]);
      expect(hits.map((h) => h.id).sort()).toEqual([b.id, c.id].sort());
      expect(hits.every((h) => h.match_count === 0 && h.term_count === 0)).toBe(true);
    });
  });

  describe('crit. 5: order by matches (desc), then newest', () => {
    it('with k = 1 the order is 5, 3, 3, 2 and equal counts have the youngest first', async () => {
      const t = ['feta', 'tomaat', 'olijf', 'ui', 'look'].map((x) => `${x}${s}`);
      // Created in this order, so created_at rises: two3a < three3b.
      const two = await make('Twee', [t[0], t[1]]);
      const three1 = await make('Drie oud', [t[0], t[1], t[3]]);
      const five = await make('Vijf', t);
      const three2 = await make('Drie nieuw', [t[1], t[2], t[4]]);
      const ids = [two.id, three1.id, five.id, three2.id];
      const hits = await ownHits(ids, t, [], 1);
      expect(hits.map((h) => h.match_count)).toEqual([5, 3, 3, 2]);
      expect(hits.map((h) => h.id)).toEqual([five.id, three2.id, three1.id, two.id]);
    });
  });

  describe('crit. 8: the result can be filtered and ordered further with PostgREST', () => {
    it('lte, overlaps and order work on the rpc result, and the id is present', async () => {
      const fast = await make('Snel', [`feta${s}`, `tomaat${s}`], { prep_minutes: 10, total_minutes: 20, equipment: ['Pan'] });
      const slow = await make('Traag', [`feta${s}`], { prep_minutes: 40, total_minutes: 60, equipment: ['Pan'] });
      const noPan = await make('Zonder pan', [`feta${s}`], { prep_minutes: 5, total_minutes: 10, equipment: [] });
      const ids = [fast.id, slow.id, noPan.id];
      const terms = [`feta${s}`, `tomaat${s}`];

      const timed = await search(terms, [], 1).lte('prep_minutes', 15);
      expect(timed.error).toBeNull();
      expect(((timed.data ?? []) as Hit[]).filter((h) => ids.includes(h.id)).map((h) => h.id).sort()).toEqual([fast.id, noPan.id].sort());

      const gear = await search(terms, [], 1).overlaps('equipment', ['Pan']);
      expect(gear.error).toBeNull();
      expect(((gear.data ?? []) as Hit[]).filter((h) => ids.includes(h.id)).map((h) => h.id).sort()).toEqual([fast.id, slow.id].sort());

      const ordered = await search(terms, [], 1).order('match_count', { ascending: false }).order('created_at', { ascending: false });
      expect(ordered.error).toBeNull();
      const own = ((ordered.data ?? []) as Hit[]).filter((h) => ids.includes(h.id));
      expect(own.map((h) => h.id)).toEqual([fast.id, noPan.id, slow.id]);
      expect(own.every((h) => typeof h.id === 'string')).toBe(true);
    });

    it('returns the columns the overview needs: photos, family_id, rating_avg, rating_count, author_name', async () => {
      const a = await make('Kolommen', [`feta${s}`]);
      const hits = await ownHits([a.id], [`feta${s}`], [], 1);
      expect(hits).toHaveLength(1);
      for (const key of ['photos', 'family_id', 'rating_avg', 'rating_count', 'author_name', 'prep_minutes', 'equipment', 'created_at']) {
        expect(Object.keys(hits[0]), key).toContain(key);
      }
      expect(hits[0].author_name).toBe('Sam Zoeker');
      expect(hits[0].rating_count).toBe(0);
      expect(hits[0].rating_avg).toBeNull();
    });
  });

  describe('crit. 9: empty terms are skipped', () => {
    it('empty and whitespace-only elements do not count for n or for the limit of 10', async () => {
      const a = await make('A', [`feta${s}`]);
      const terms = [`feta${s}`, '', '   ', '', ' ', '', '', '', '', '', '  '];
      const res = await search(terms);
      expect(res.error).toBeNull();
      const hit = ((res.data ?? []) as Hit[]).find((h) => h.id === a.id);
      expect(hit?.term_count).toBe(1);
      expect(hit?.match_count).toBe(1);
    });

    it('a term of 1 character is accepted: "a" finds "aardappel"', async () => {
      const a = await make('A', [`aardappel${s}`]);
      const hits = await ownHits([a.id], ['a'], [], 1);
      expect(hits.map((h) => h.id)).toEqual([a.id]);
    });

    it('only empty terms behave like no search: n = 0, nothing excluded', async () => {
      const a = await make('A', [`feta${s}`]);
      const hits = await ownHits([a.id], ['  ', ''], []);
      expect(hits).toHaveLength(1);
      expect(hits[0].term_count).toBe(0);
    });
  });

  describe('rights (R-002 / kernbeslissing: rights in row-level rules)', () => {
    it('an anonymous call is refused (42501) or returns no rows, never recipes', async () => {
      await make('A', [`feta${s}`]);
      const res = await anonClient().rpc('search_recipes', { p_terms: [`feta${s}`], p_without: [], p_min: 1 });
      if (res.error) expect(res.error.code).toBe(NO_PRIVILEGE);
      else expect(res.data ?? []).toHaveLength(0);
    });

    it('a signed-in user sees recipes of other users (shared database)', async () => {
      const other = await createTestUser('rsearch2', { displayName: 'Olga Ander' });
      try {
        const a = await make('Van Sam', [`feta${s}`]);
        const res = await other.client.rpc('search_recipes', { p_terms: [`feta${s}`], p_without: [], p_min: 1 });
        expect(res.error).toBeNull();
        expect(((res.data ?? []) as Hit[]).map((h) => h.id)).toContain(a.id);
      } finally {
        await deleteTestUser(other);
      }
    });
  });
});
