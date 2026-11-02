import { beforeEach, describe, expect, it, vi } from 'vitest';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };

// T-017 / R-014: client-side favourite calls and the pure filter helper.
const nl = nlJson as Record<string, string>;

type Result = { data?: unknown; error: { code?: string; message: string } | null; status: number };
let insertResult: Result;
let deleteResult: Result;

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve(insertResult),
      delete: () => ({ eq: () => ({ select: () => Promise.resolve(deleteResult) }) }),
    }),
  },
}));

import { addFavorite, applyFavoritesOnly, removeFavorite } from '../../src/lib/favorites';

beforeEach(() => {
  insertResult = { error: null, status: 201 };
  deleteResult = { data: [{ recipe_id: 'x' }], error: null, status: 200 };
});

describe('crit. 6: add is idempotent', () => {
  it('a 23505 on add counts as success ("is al favoriet")', async () => {
    insertResult = { error: { code: '23505', message: 'duplicate' }, status: 409 };
    const res = await addFavorite('x');
    expect(res.error).toBeNull();
  });

  it('another error on add is reported', async () => {
    insertResult = { error: { code: '42501', message: 'denied' }, status: 403 };
    const res = await addFavorite('x');
    expect(res.error).not.toBeNull();
    expect(res.status).toBe(403);
  });

  it('a successful add has no error', async () => {
    expect((await addFavorite('x')).error).toBeNull();
  });
});

describe('crit. 6: remove', () => {
  it('a delete that touches 0 rows counts as success (already not a favourite)', async () => {
    deleteResult = { data: [], error: null, status: 200 };
    expect((await removeFavorite('x')).error).toBeNull();
  });

  it('a database error on remove is reported', async () => {
    deleteResult = { data: null, error: { code: '500', message: 'boom' }, status: 500 };
    expect((await removeFavorite('x')).error).not.toBeNull();
  });
});

describe('crit. 4: favourites filter', () => {
  it('applyFavoritesOnly adds eq(is_favorite, true) and returns the query', () => {
    const calls: unknown[][] = [];
    const query = {
      eq(...args: unknown[]) {
        calls.push(args);
        return query;
      },
    };
    const out = applyFavoritesOnly(query as never);
    expect(calls).toEqual([['is_favorite', true]]);
    expect(out).toBe(query);
  });
});

describe('crit. 1 and 3: texts in nl.json', () => {
  it('has the labels and messages', () => {
    expect(nl['favorites.add']).toBe('Bewaar als favoriet');
    expect(nl['favorites.remove']).toBe('Verwijder uit favorieten');
    expect(nl['favorites.error']).toBe('Favoriet bewaren mislukt.');
    expect(nl['favorites.empty']).toBe('Nog geen favorieten.');
  });
});
