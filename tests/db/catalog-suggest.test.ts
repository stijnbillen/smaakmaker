import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import { RETIRED_LANG } from '../helpers/retired-lang';

// T-020 / R-019 against the local Supabase: closeness of a typed term to catalogue items.
// Test items use invented keys ("qzvk..."), so the starting list never interferes; every test removes its items.
const INVALID_PARAMETER = '22023';
const INSUFFICIENT_PRIVILEGE = '42501';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (items: string[]) => `array[${items.map(lit).join(',')}]::text[]`;

type Table = 'ingredients' | 'units';
type Mode = 'autocomplete' | 'didYouMean';

interface Row {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
  matched: string;
  match_kind: 'exact' | 'prefix' | 'similar';
  distance: number | null;
  similarity: number;
}

interface Item {
  nl?: string | null;
  fr?: string | null;
  syn?: string[];
}

const created: Array<{ table: Table; ids: string[] }> = [];

/** Inserts items through pg (the only way to set synonyms) and returns their ids in the given order. */
async function addItems(table: Table, items: Item[]): Promise<string[]> {
  const ids: string[] = [];
  for (const it of items) {
    const rows = await sql<{ id: string }>(
      `insert into public.${table} (name_nl, name_fr, synonyms)
       values (${it.nl == null ? 'null' : lit(it.nl)}, ${it.fr == null ? 'null' : lit(it.fr)}, ${arr(it.syn ?? [])}) returning id`,
    );
    ids.push(rows[0].id);
  }
  created.push({ table, ids });
  return ids;
}

async function removeItems(): Promise<void> {
  while (created.length > 0) {
    const { table, ids } = created.pop()!;
    if (ids.length > 0) {
      await sql(`delete from public.${table} where id in (${ids.map(lit).join(',')})`).catch(() => undefined);
    }
  }
}

const names = (rows: Row[]) => rows.map((r) => r.name_nl ?? r.name_fr);

describe('catalogue suggestions (R-019)', () => {
  let a: TestUser;

  const suggest = async (
    term: string,
    mode: Mode = 'didYouMean',
    lang: 'nl' | 'fr' = 'nl',
    kind: 'ingredients' | 'units' = 'ingredients',
  ): Promise<Row[]> => {
    const res = await a.client.rpc(kind === 'ingredients' ? 'suggest_ingredients' : 'suggest_units', {
      p_term: term,
      p_autocomplete: mode === 'autocomplete',
      p_lang: lang,
    });
    expect(res.error, `${kind} ${term}`).toBeNull();
    return (res.data ?? []) as Row[];
  };

  /** Trigram similarity and restricted Damerau-Levenshtein distance of two keys, computed by the database. */
  const measure = async (x: string, y: string) => {
    const r = await sql<{ s: number; d: number }>(
      `select extensions.similarity(${lit(x)}, ${lit(y)}) as s, public.dl_distance(${lit(x)}, ${lit(y)}) as d`,
    );
    return { sim: Number(r[0].s), dist: Number(r[0].d) };
  };

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('sugg');
  });

  afterAll(async () => {
    await removeItems();
    if (a) await deleteTestUser(a);
  });

  describe('crit. 1: keys, both languages, synonyms', () => {
    it.each(['Creme fraiche', 'CRÈME  FRAÎCHE', ' crème fraîche '])(
      '"%s" is an exact hit on crème fraîche (case, accents, whitespace do not matter)',
      async (term) => {
        const rows = await suggest(term);
        expect(rows[0].name_nl).toBe('crème fraîche');
        expect(rows[0].match_kind).toBe('exact');
      },
    );

    it('"Creme" and "crème" give the same rows in the same order', async () => {
      const x = await suggest('Creme', 'autocomplete');
      const y = await suggest('crème', 'autocomplete');
      expect(x.length).toBeGreaterThan(0);
      expect(x.map((r) => [r.id, r.match_kind])).toEqual(y.map((r) => [r.id, r.match_kind]));
    });

    it('"tomate" (French name) gives tomaat and "brocolli" (synonym) gives broccoli, both exact', async () => {
      const t = await suggest('tomate');
      expect(t[0]).toMatchObject({ name_nl: 'tomaat', match_kind: 'exact' });
      const b = await suggest('brocolli');
      expect(b[0]).toMatchObject({ name_nl: 'broccoli', match_kind: 'exact' });
    });

    it('a result row has name_fr and no English key (R-026 crit. 3)', async () => {
      const rows = await suggest('tomate');
      expect(rows[0]).toHaveProperty('name_fr', 'tomate');
      expect(Object.keys(rows[0]).filter((k) => k.endsWith('_en'))).toEqual([]);
    });

    it('`matched` is the name or synonym as stored ("brocolli" for the term "Brocolli")', async () => {
      const rows = await suggest('Brocolli');
      expect(rows[0].matched).toBe('brocolli');
      const fr = await suggest('TOMATE');
      expect(fr[0].matched).toBe('tomate');
    });

    it('keeps the stored spelling of a synonym with capitals', async () => {
      await addItems('ingredients', [{ nl: 'qzvkhoofd', syn: ['QzvkSyn'] }]);
      const rows = await suggest('qzvksyn');
      expect(rows[0]).toMatchObject({ name_nl: 'qzvkhoofd', matched: 'QzvkSyn', match_kind: 'exact' });
      await removeItems();
    });
  });

  describe('crit. 2: an exact hit is a hit', () => {
    it('"zout" gives zout first with match_kind exact', async () => {
      const rows = await suggest('zout');
      expect(rows[0]).toMatchObject({ name_nl: 'zout', match_kind: 'exact' });
    });
  });

  describe('crit. 3: Damerau-Levenshtein distance', () => {
    it.each([
      ['abcd', 'abcd', 0],
      ['abcd', 'abdc', 1], // swap of neighbours
      ['abcd', 'abc', 1],
      ['abc', 'abcd', 1],
      ['abcd', 'abed', 1],
      ['', 'abc', 3],
      ['ca', 'abc', 3], // restricted variant: a swapped pair is not edited again
      ['paprica', 'paprika', 1],
      ['tomaaat', 'tomaat', 1],
      ['tomaten', 'tomaat', 3],
      ['crème', 'creme', 1], // per character, not per byte
    ])('dl_distance(%j, %j) = %i', async (x, y, expected) => {
      const r = await sql<{ d: number }>(`select public.dl_distance(${lit(x)}, ${lit(y)}) as d`);
      expect(Number(r[0].d)).toBe(expected);
    });

    it.each([
      [1, null],
      [2, null],
      [3, null],
      [4, 1],
      [5, 1],
      [6, 2],
      [9, 2],
      [10, 3],
      [25, 3],
    ])('dl_max_distance(%i) = %s', async (len, expected) => {
      const r = await sql<{ m: number | null }>(`select public.dl_max_distance(${len}) as m`);
      expect(r[0].m === null ? null : Number(r[0].m)).toBe(expected);
    });

    // Items are chosen with trigram similarity below 0.35 (checked first), so only the distance can let them in.
    const boundary = async (term: string, near: string, far: string, nearDist: number, farDist: number) => {
      for (const [other, dist] of [
        [near, nearDist],
        [far, farDist],
      ] as const) {
        const m = await measure(term, other);
        expect(m.dist, `${term}/${other}`).toBe(dist);
        expect(m.sim, `${term}/${other}`).toBeLessThan(0.35);
      }
      await addItems('ingredients', [{ nl: near }, { nl: far }]);
      const rows = await suggest(term);
      expect(names(rows)).toContain(near);
      expect(names(rows)).not.toContain(far);
      expect(rows.find((r) => r.name_nl === near)).toMatchObject({ match_kind: 'similar', distance: nearDist });
      await removeItems();
    };

    it('term of 4 characters: distance 1 is in, distance 2 is out', () => boundary('qzvk', 'qxvk', 'qxxk', 1, 2));
    it('term of 6 characters: distance 2 is in, distance 3 is out', () =>
      boundary('qzvkwj', 'qxxkwj', 'qxxxwj', 2, 3));
    it('term of 10 characters: distance 3 is in, distance 4 is out', () =>
      boundary('qzvkwjhpmb', 'qxvkxjhxmb', 'qxvxxjhxmb', 3, 4));

    it('term of 3 characters gives no similar row, even at distance 1 (and with trigram similarity >= 0.35)', async () => {
      const m = await measure('qzv', 'qxv');
      expect(m.dist).toBe(1);
      const m2 = await measure('qzv', 'qzvk');
      expect(m2.sim).toBeGreaterThanOrEqual(0.35);
      await addItems('ingredients', [{ nl: 'qxv' }, { nl: 'qzvk' }]);
      const rows = await suggest('qzv', 'didYouMean');
      expect(rows.filter((r) => r.match_kind === 'similar')).toEqual([]);
      await removeItems();
    });
  });

  describe('crit. 4: trigram similarity', () => {
    it('similarity("tomaten","tomaat") rounds to 0.36 and "tomaten" suggests tomaat as similar (distance is 3)', async () => {
      const r = await sql<{ s: string }>(`select round(extensions.similarity('tomaten','tomaat')::numeric, 2) as s`);
      expect(Number(r[0].s)).toBe(0.36);
      expect((await measure('tomaten', 'tomaat')).dist).toBe(3);
      const rows = await suggest('tomaten');
      expect(rows.find((r2) => r2.name_nl === 'tomaat')).toMatchObject({ match_kind: 'similar' });
    });

    it('a pair just under 0.35 stays out, a pair at 0.35 or more comes in (both beyond the distance limit)', async () => {
      const term = 'qzvkwj';
      const inside = 'qzvkabc';
      const outside = 'qzvkabcd';
      const mi = await measure(term, inside);
      const mo = await measure(term, outside);
      expect(mi.sim).toBeGreaterThanOrEqual(0.35);
      expect(mo.sim).toBeLessThan(0.35);
      expect(mo.sim).toBeGreaterThan(0.3);
      expect(mi.dist).toBeGreaterThan(2);
      expect(mo.dist).toBeGreaterThan(2);
      await addItems('ingredients', [{ nl: inside }, { nl: outside }]);
      const rows = await suggest(term);
      expect(names(rows)).toContain(inside);
      expect(names(rows)).not.toContain(outside);
      await removeItems();
    });

    it('a term of 1-3 characters gets no similar row through trigram either', async () => {
      for (const term of ['to', 'tom', 'zou']) {
        const rows = await suggest(term, 'didYouMean');
        expect(rows.filter((r) => r.match_kind === 'similar'), term).toEqual([]);
      }
    });
  });

  describe('crit. 5: autocomplete (prefix)', () => {
    it('"bro" gives broccoli as prefix in autocomplete and nothing prefix in didYouMean', async () => {
      const auto = await suggest('bro', 'autocomplete');
      expect(auto.find((r) => r.name_nl === 'broccoli')).toMatchObject({ match_kind: 'prefix' });
      const dym = await suggest('bro', 'didYouMean');
      expect(dym.filter((r) => r.match_kind === 'prefix')).toEqual([]);
    });

    it('one character gives no prefix rows; the unit "g" is still an exact hit', async () => {
      const rows = await suggest('b', 'autocomplete');
      expect(rows.filter((r) => r.match_kind === 'prefix')).toEqual([]);
      const unit = await suggest('g', 'autocomplete', 'nl', 'units');
      expect(unit[0]).toMatchObject({ name_nl: 'g', match_kind: 'exact' });
    });

    it('% and _ are plain characters, not wildcards', async () => {
      for (const term of ['br%', 'b_o', 'br_']) {
        const rows = await suggest(term, 'autocomplete');
        expect(rows.filter((r) => r.match_kind === 'prefix'), term).toEqual([]);
      }
    });

    it('an item that is both a prefix and within the distance appears once: prefix in autocomplete, similar in didYouMean', async () => {
      const [id] = await addItems('ingredients', [{ nl: 'qzvkwa' }]);
      const auto = (await suggest('qzvkw', 'autocomplete')).filter((r) => r.id === id);
      const dym = (await suggest('qzvkw', 'didYouMean')).filter((r) => r.id === id);
      expect(auto).toHaveLength(1);
      expect(auto[0].match_kind).toBe('prefix');
      expect(dym).toHaveLength(1);
      expect(dym[0].match_kind).toBe('similar');
      await removeItems();
    });
  });

  describe('crit. 6: order and limit', () => {
    it('exact first, then prefix, then similar; five rows in total', async () => {
      // term "qzvkw": 1 exact, 2 prefix, 3 similar candidates; the sixth is cut off.
      await addItems('ingredients', [
        { nl: 'qzvkw' },
        { nl: 'qzvkwa' },
        { nl: 'qzvkwb' },
        { nl: 'qzvkx' },
        { nl: 'qzvky' },
        { nl: 'qxvkw' },
      ]);
      const rows = await suggest('qzvkw', 'autocomplete');
      expect(rows.map((r) => r.match_kind)).toEqual(['exact', 'prefix', 'prefix', 'similar', 'similar']);
      expect(names(rows)).toEqual(['qzvkw', 'qzvkwa', 'qzvkwb', 'qzvkx', 'qzvky']);
      await removeItems();
    });

    it('similar: lower distance first, then higher similarity, then alphabetical', async () => {
      await addItems('ingredients', [
        { nl: 'qzvkxx' }, // distance 2
        { nl: 'qzvxwj' }, // distance 1, low similarity
        { nl: 'qzvkwb' }, // distance 1, high similarity
        { nl: 'qzvkwa' }, // same as above: alphabetical first
      ]);
      const rows = await suggest('qzvkwj');
      expect(names(rows)).toEqual(['qzvkwa', 'qzvkwb', 'qzvxwj', 'qzvkxx']);
      expect(rows[0].distance).toBe(1);
      expect(rows[0].similarity).toBeCloseTo(rows[1].similarity, 5);
      expect(rows[1].similarity).toBeGreaterThan(rows[2].similarity);
      expect(rows[3].distance).toBe(2);
      await removeItems();
    });

    it('eight candidates give exactly the first five of the order', async () => {
      const list = 'abcdefgh'.split('').map((c) => `qzvkw${c}`);
      await addItems('ingredients', list.map((nl) => ({ nl })));
      const rows = await suggest('qzvkwj');
      expect(names(rows)).toEqual(list.slice(0, 5));
      await removeItems();
    });

    it('an item with a name and a synonym that both fit appears once, with its best key', async () => {
      const [id] = await addItems('ingredients', [{ nl: 'qzvxxj', syn: ['QzvkwX'] }]); // distances 2 and 1
      const rows = (await suggest('qzvkwj')).filter((r) => r.id === id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ matched: 'QzvkwX', distance: 1 });
      await removeItems();
    });

    it('nl and fr give the same set of items', async () => {
      await addItems('ingredients', [{ nl: 'qzvkwa', fr: 'qzvkwz' }, { fr: 'qzvkwb' }, { nl: 'qzvkwc' }]);
      const nl = await suggest('qzvkwj', 'didYouMean', 'nl');
      const fr = await suggest('qzvkwj', 'didYouMean', 'fr');
      expect(nl.map((r) => r.id).sort()).toEqual(fr.map((r) => r.id).sort());
      await removeItems();
    });
  });

  describe('crit. 7: examples against the starting list', () => {
    it.each(['didYouMean', 'autocomplete'] as const)('mode %s', async (mode) => {
      expect((await suggest('brocolli', mode))[0]).toMatchObject({ name_nl: 'broccoli', match_kind: 'exact' });
      const pap = await suggest('paprica', mode);
      expect(pap.find((r) => r.match_kind === 'similar')).toMatchObject({ name_nl: 'paprika' });
      const tom = await suggest('tomaaat', mode);
      expect(tom.find((r) => r.match_kind === 'similar')).toMatchObject({ name_nl: 'tomaat' });
      expect((await suggest('tomate', mode))[0]).toMatchObject({ name_nl: 'tomaat', match_kind: 'exact' });
      expect((await suggest('zout', mode))[0]).toMatchObject({ name_nl: 'zout', match_kind: 'exact' });
    });

    it('didYouMean mode: paprika and tomaat are the first rows, "xqzv" gives nothing', async () => {
      expect((await suggest('paprica'))[0]).toMatchObject({ name_nl: 'paprika', match_kind: 'similar' });
      expect((await suggest('tomaaat'))[0]).toMatchObject({ name_nl: 'tomaat', match_kind: 'similar' });
      expect(await suggest('xqzv')).toEqual([]);
    });

    it('autocomplete mode gives the same first item as didYouMean for the examples', async () => {
      for (const term of ['brocolli', 'paprica', 'tomaaat', 'tomate', 'zout']) {
        const x = await suggest(term, 'autocomplete');
        const y = await suggest(term, 'didYouMean');
        expect(x[0].id, term).toBe(y[0].id);
      }
    });
  });

  describe('crit. 8: units, and tags and equipment unchanged', () => {
    it('"eetlepl" gives el as similar (via the synonym), "EL" and "kg" are exact', async () => {
      const el = await suggest('eetlepl', 'didYouMean', 'nl', 'units');
      expect(el[0]).toMatchObject({ name_nl: 'el', match_kind: 'similar' });
      expect((await suggest('EL', 'didYouMean', 'nl', 'units'))[0]).toMatchObject({ name_nl: 'el', match_kind: 'exact' });
      expect((await suggest('kg', 'didYouMean', 'nl', 'units'))[0]).toMatchObject({ name_nl: 'kg', match_kind: 'exact' });
    });

    it('"thee" in autocomplete gives tl as prefix (via "theelepel")', async () => {
      const rows = await suggest('thee', 'autocomplete', 'nl', 'units');
      expect(rows.find((r) => r.name_nl === 'tl')).toMatchObject({ match_kind: 'prefix' });
    });

    it('"blik" as ingredient and as unit: each is returned only by the function of its own kind', async () => {
      const [ing] = await addItems('ingredients', [{ nl: 'blik' }]); // the unit "blik" is in the starting list
      const ingRows = await suggest('blik');
      const unitRows = await suggest('blik', 'didYouMean', 'nl', 'units');
      expect(ingRows[0]).toMatchObject({ id: ing, match_kind: 'exact' });
      expect(unitRows[0]).toMatchObject({ name_nl: 'blik', match_kind: 'exact' });
      expect(unitRows.map((r) => r.id)).not.toContain(ing);
      expect(ingRows.map((r) => r.id)).not.toContain(unitRows[0].id);
      await removeItems();
    });

    it('tags keep exact comparison: a recipe with dish tag "soepp" gets a new tag, not "soep"', async () => {
      const res = await a.client
        .from('recipes')
        .insert({
          title: `Soeptest ${Date.now()}`,
          ingredients: [{ name: 'Zout' }],
          steps: ['Meng.'],
          prep_minutes: 10,
          total_minutes: 20,
          servings: 4,
          dish_tags: ['soepp'],
        })
        .select('id,dish_tags')
        .single();
      try {
        expect(res.error).toBeNull();
        expect(res.data?.dish_tags).toEqual(['soepp']);
        const tags = await sql<{ name: string }>(`select name from public.tags where kind = 'dish' and name_key in ('soep','soepp') order by name`);
        expect(tags.map((t) => t.name)).toEqual(['soep', 'soepp']);
      } finally {
        if (res.data?.id) await sql(`delete from public.recipes where id = ${lit(res.data.id as string)}`);
        await sql(`delete from public.tags where kind = 'dish' and name_key = 'soepp'`);
      }
    });
  });

  describe('rights and input checks', () => {
    it('anon cannot execute the wrappers (42501)', async () => {
      for (const fn of ['suggest_ingredients', 'suggest_units']) {
        const res = await anonClient().rpc(fn, { p_term: 'zout', p_autocomplete: false, p_lang: 'nl' });
        expect(res.error?.code, fn).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });

    it('the internal and pure functions are not callable through the API', async () => {
      for (const [fn, args] of [
        ['catalog_suggest', { p_kind: 'ingredient', p_term: 'zout', p_autocomplete: false, p_lang: 'nl' }],
        ['dl_distance', { a: 'x', b: 'y' }],
        ['dl_max_distance', { p_len: 5 }],
      ] as const) {
        const res = await a.client.rpc(fn, args);
        expect(res.error, fn).not.toBeNull();
      }
    });

    it('a language other than nl or fr (also the retired code) is refused with 22023', async () => {
      for (const lang of [RETIRED_LANG, 'de']) {
        const res = await a.client.rpc('suggest_ingredients', { p_term: 'zout', p_autocomplete: false, p_lang: lang });
        expect(res.error?.code, lang).toBe(INVALID_PARAMETER);
      }
    });

    it('an empty, blank or null term gives no rows', async () => {
      expect(await suggest('')).toEqual([]);
      expect(await suggest('   ')).toEqual([]);
      const res = await a.client.rpc('suggest_ingredients', { p_term: null, p_autocomplete: true, p_lang: 'nl' });
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    });
  });
});
