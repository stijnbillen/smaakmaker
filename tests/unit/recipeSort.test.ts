import { describe, expect, it } from 'vitest';
import {
  changeField,
  DEFAULT_SORT,
  defaultDirection,
  parseSort,
  sortRecipes,
  toSearchParams,
  type RecipeSort,
  type SortDirection,
  type SortField,
} from '../../src/lib/recipeSort';

// T-029 / R-028: the overview sort. Pure logic, no browser and no database.
const FIELDS: SortField[] = ['created', 'rating', 'title', 'total', 'prep'];
const DIRECTIONS: SortDirection[] = ['asc', 'desc'];

interface Row {
  id: string;
  title: string;
  created_at: string;
  rating_avg: number | string | null;
  rating_count: number;
  prep_minutes: number | null;
  total_minutes: number | null;
  matchCount?: number;
}

let n = 0;
/** A row with a unique id and a creation time that grows with every call unless given. */
const row = (over: Partial<Row> = {}): Row => {
  n += 1;
  return {
    id: `id-${String(n).padStart(4, '0')}`,
    title: `Titel ${n}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    rating_avg: null,
    rating_count: 0,
    prep_minutes: 10,
    total_minutes: 20,
    ...over,
  };
};
const titles = (rows: Row[]) => rows.map((r) => r.title);
const sort = (field: SortField, direction: SortDirection): RecipeSort => ({ field, direction });

describe('defaultDirection and changeField (crit. 9)', () => {
  it('is descending for created and rating, ascending for title, total and prep', () => {
    expect(defaultDirection('created')).toBe('desc');
    expect(defaultDirection('rating')).toBe('desc');
    expect(defaultDirection('title')).toBe('asc');
    expect(defaultDirection('total')).toBe('asc');
    expect(defaultDirection('prep')).toBe('asc');
  });

  it('the default sort is created, descending (newest first)', () => {
    expect(DEFAULT_SORT).toEqual({ field: 'created', direction: 'desc' });
  });

  it('choosing another field gives that field its default direction, even if the old direction differed', () => {
    expect(changeField(sort('created', 'asc'), 'title')).toEqual({ field: 'title', direction: 'asc' });
    expect(changeField(sort('title', 'desc'), 'rating')).toEqual({ field: 'rating', direction: 'desc' });
    expect(changeField(sort('rating', 'asc'), 'created')).toEqual({ field: 'created', direction: 'desc' });
    expect(changeField(sort('total', 'desc'), 'prep')).toEqual({ field: 'prep', direction: 'asc' });
    expect(changeField(sort('prep', 'desc'), 'total')).toEqual({ field: 'total', direction: 'asc' });
  });
});

describe('URL round trip (crit. 14)', () => {
  it('parseSort(toSearchParams(sort)) gives the same sort for every field and direction', () => {
    for (const field of FIELDS) {
      for (const direction of DIRECTIONS) {
        const params = toSearchParams(sort(field, direction), new URLSearchParams());
        expect(parseSort(params)).toEqual({ field, direction });
      }
    }
  });

  it('the default choice leaves both parameters out', () => {
    const params = toSearchParams(DEFAULT_SORT, new URLSearchParams('sorteer=titel&richting=af'));
    expect(params.has('sorteer')).toBe(false);
    expect(params.has('richting')).toBe(false);
  });

  it('the default direction of a field leaves "richting" out', () => {
    for (const field of FIELDS) {
      const params = toSearchParams(sort(field, defaultDirection(field)), new URLSearchParams());
      expect(params.has('richting')).toBe(false);
    }
  });

  it('a non-default direction writes richting=op / richting=af', () => {
    expect(toSearchParams(sort('created', 'asc'), new URLSearchParams()).get('richting')).toBe('op');
    expect(toSearchParams(sort('title', 'desc'), new URLSearchParams()).get('richting')).toBe('af');
  });

  it('uses the documented values for sorteer; "beoordeling" stays for the stars (old links)', () => {
    expect(toSearchParams(sort('rating', 'desc'), new URLSearchParams()).get('sorteer')).toBe('beoordeling');
    expect(toSearchParams(sort('title', 'asc'), new URLSearchParams()).get('sorteer')).toBe('titel');
    expect(toSearchParams(sort('total', 'asc'), new URLSearchParams()).get('sorteer')).toBe('totaal');
    expect(toSearchParams(sort('prep', 'asc'), new URLSearchParams()).get('sorteer')).toBe('prep');
    expect(parseSort(new URLSearchParams('sorteer=beoordeling'))).toEqual({ field: 'rating', direction: 'desc' });
  });

  it('an unknown field falls back to created, descending', () => {
    expect(parseSort(new URLSearchParams('sorteer=onzin'))).toEqual({ field: 'created', direction: 'desc' });
    expect(parseSort(new URLSearchParams())).toEqual({ field: 'created', direction: 'desc' });
  });

  it('an unknown direction falls back to the default direction of the field', () => {
    expect(parseSort(new URLSearchParams('sorteer=titel&richting=zijwaarts'))).toEqual({ field: 'title', direction: 'asc' });
  });

  it('keeps other parameters', () => {
    const base = new URLSearchParams('soort=hoofd&gerief=oven&prep=15&totaal=60');
    const params = toSearchParams(sort('title', 'desc'), base);
    expect(params.get('soort')).toBe('hoofd');
    expect(params.get('gerief')).toBe('oven');
    expect(params.get('prep')).toBe('15');
    expect(params.get('totaal')).toBe('60');
  });
});

describe('sort by stars (crit. 10)', () => {
  const make = () => {
    const a = row({ title: 'A', rating_avg: 4.5, rating_count: 3 });
    const d = row({ title: 'D', rating_avg: 4.5, rating_count: 1 }); // younger than A
    const c = row({ title: 'C', rating_avg: 3.0, rating_count: 2 });
    const b = row({ title: 'B', rating_avg: null, rating_count: 0 });
    return [b, c, d, a];
  };

  it('descending: A, D, C, B (equal average: most reviews first; no review last)', () => {
    expect(titles(sortRecipes(make(), sort('rating', 'desc'), 'nl-BE'))).toEqual(['A', 'D', 'C', 'B']);
  });

  it('ascending: C, A, D, B (no review still last; equal average: most reviews first)', () => {
    expect(titles(sortRecipes(make(), sort('rating', 'asc'), 'nl-BE'))).toEqual(['C', 'A', 'D', 'B']);
  });

  it('rating_avg as string ("4.5") and as number give the same order', () => {
    const asString = make().map((r) => ({ ...r, rating_avg: r.rating_avg === null ? null : String(r.rating_avg) }));
    for (const direction of DIRECTIONS) {
      expect(titles(sortRecipes(asString, sort('rating', direction), 'nl-BE'))).toEqual(
        titles(sortRecipes(make(), sort('rating', direction), 'nl-BE')),
      );
    }
  });
});

describe('sort by title (crit. 11)', () => {
  const make = () => {
    const old = row({ title: 'appel', created_at: '2026-01-01T10:00:00Z' });
    const young = row({ title: 'Appel', created_at: '2026-02-01T10:00:00Z' });
    return [row({ title: 'Zalm' }), old, row({ title: 'éclair' }), young, row({ title: 'eend' })];
  };

  for (const locale of ['nl-BE', 'fr-BE']) {
    it(`ascending in ${locale}: Appel/appel (newest first), éclair, eend, Zalm; case and accents do not matter`, () => {
      expect(titles(sortRecipes(make(), sort('title', 'asc'), locale))).toEqual(['Appel', 'appel', 'éclair', 'eend', 'Zalm']);
    });

    it(`descending in ${locale}: Zalm, eend, éclair, then the equal "appel" pair with the newest first`, () => {
      expect(titles(sortRecipes(make(), sort('title', 'desc'), locale))).toEqual(['Zalm', 'eend', 'éclair', 'Appel', 'appel']);
    });
  }
});

describe('sort by time (crit. 12)', () => {
  for (const [field, column] of [
    ['total', 'total_minutes'],
    ['prep', 'prep_minutes'],
  ] as const) {
    const make = () => {
      const base = { prep_minutes: 5, total_minutes: 5 };
      return [30, 10, null, 60].map((m) => row({ ...base, [column]: m, title: String(m) }));
    };

    it(`${field} ascending: 10, 30, 60, then recipes without a time`, () => {
      expect(titles(sortRecipes(make(), sort(field, 'asc'), 'nl-BE'))).toEqual(['10', '30', '60', 'null']);
    });

    it(`${field} descending: 60, 30, 10, recipes without a time still last`, () => {
      expect(titles(sortRecipes(make(), sort(field, 'desc'), 'nl-BE'))).toEqual(['60', '30', '10', 'null']);
    });
  }
});

describe('ties go to the newest recipe (crit. 13)', () => {
  /** Two rows equal in the sort key, the second one younger. Shown in both input orders. */
  const pair = (_field: SortField): [Row, Row] => {
    const shared: Partial<Row> = { title: 'Gelijk', rating_avg: 4, rating_count: 2, prep_minutes: 15, total_minutes: 30 };
    const older = row({ ...shared, created_at: '2026-01-01T10:00:00Z' });
    const newer = row({ ...shared, created_at: '2026-03-01T10:00:00Z' });
    // For `created` itself the key is the date, so equal keys mean an equal date: tested separately below.
    return [older, newer];
  };

  for (const field of FIELDS.filter((f) => f !== 'created')) {
    for (const direction of DIRECTIONS) {
      it(`${field} ${direction}: the newest of two equal rows comes first, whatever the input order`, () => {
        const [older, newer] = pair(field);
        expect(sortRecipes([older, newer], sort(field, direction), 'nl-BE')[0]).toBe(newer);
        expect(sortRecipes([newer, older], sort(field, direction), 'nl-BE')[0]).toBe(newer);
      });
    }
  }

  for (const direction of DIRECTIONS) {
    it(`created ${direction}: an equal created_at is decided by id, so the order is stable`, () => {
      const x = row({ created_at: '2026-01-01T10:00:00Z' });
      const y = row({ created_at: '2026-01-01T10:00:00Z' });
      const one = sortRecipes([x, y], sort('created', direction), 'nl-BE').map((r) => r.id);
      const other = sortRecipes([y, x], sort('created', direction), 'nl-BE').map((r) => r.id);
      expect(one).toEqual(other);
    });
  }

  it('created: descending is newest first, ascending is oldest first', () => {
    const [older, newer] = pair('created');
    expect(sortRecipes([older, newer], sort('created', 'desc'), 'nl-BE')).toEqual([newer, older]);
    expect(sortRecipes([newer, older], sort('created', 'asc'), 'nl-BE')).toEqual([older, newer]);
  });

  it('returns a new array and leaves the input alone', () => {
    const rows = [row(), row()];
    const copy = [...rows];
    const out = sortRecipes(rows, sort('created', 'asc'), 'nl-BE');
    expect(out).not.toBe(rows);
    expect(rows).toEqual(copy);
  });
});

describe('search matches stay first (crit. 15)', () => {
  it('matchCount decides first; the chosen sort orders within; the direction never flips matchCount', () => {
    const rows = [
      row({ title: 'Banaan', matchCount: 2 }),
      row({ title: 'Aardbei', matchCount: 1 }),
      row({ title: 'Citroen', matchCount: 2 }),
    ];
    expect(titles(sortRecipes(rows, sort('title', 'asc'), 'nl-BE'))).toEqual(['Banaan', 'Citroen', 'Aardbei']);
    expect(titles(sortRecipes(rows, sort('title', 'desc'), 'nl-BE'))).toEqual(['Citroen', 'Banaan', 'Aardbei']);
  });
});
