import { beforeEach, describe, expect, it, vi } from 'vitest';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import frJson from '../../src/i18n/fr.json' with { type: 'json' };

// T-033 / R-030: client-side week menu calls.
const nl = nlJson as Record<string, string>;
const fr = frJson as Record<string, string>;

type Result = { data?: unknown; error: { code?: string; message: string } | null; status: number };
let insertResult: Result;
let deleteResult: Result;
let updateResult: Result;
let rpcResult: Result;
const calls = { update: 0, rpc: [] as string[], order: [] as unknown[][] };

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve(insertResult),
      delete: () => ({ eq: () => ({ select: () => Promise.resolve(deleteResult) }) }),
      update: () => {
        calls.update++;
        const q = { eq: () => q, select: () => Promise.resolve(updateResult) };
        return q;
      },
      select: () => ({
        order: (...args: unknown[]) => {
          calls.order.push(args);
          return Promise.resolve({ data: [], error: null, status: 200 });
        },
      }),
    }),
    rpc: (name: string) => {
      calls.rpc.push(name);
      return Promise.resolve(rpcResult);
    },
  },
}));

import { addToWeekMenu, clearWeekMenu, fetchWeekMenu, removeFromWeekMenu, setWeekMenuServings } from '../../src/lib/weekMenu';

beforeEach(() => {
  insertResult = { error: null, status: 201 };
  deleteResult = { data: [{ recipe_id: 'x' }], error: null, status: 200 };
  updateResult = { data: [{ recipe_id: 'x' }], error: null, status: 200 };
  rpcResult = { error: null, status: 204 };
  calls.update = 0;
  calls.rpc = [];
  calls.order = [];
});

describe('crit. 4: add is idempotent', () => {
  it('a 23505 on add counts as success (already in the menu)', async () => {
    insertResult = { error: { code: '23505', message: 'duplicate' }, status: 409 };
    expect((await addToWeekMenu('x')).error).toBeNull();
  });

  it('a successful add has no error', async () => {
    expect((await addToWeekMenu('x')).error).toBeNull();
  });

  it('another error on add is reported', async () => {
    insertResult = { error: { code: '42501', message: 'denied' }, status: 403 };
    const res = await addToWeekMenu('x');
    expect(res.error).not.toBeNull();
    expect(res.status).toBe(403);
  });
});

describe('crit. 6: a full menu', () => {
  it('P0050 gives full: true, so the screen can show weekMenu.full', async () => {
    insertResult = { error: { code: 'P0050', message: 'week menu full' }, status: 400 };
    const res = (await addToWeekMenu('x')) as { full?: boolean };
    expect(res.full).toBe(true);
  });

  it('a normal add is not marked full', async () => {
    const res = (await addToWeekMenu('x')) as { full?: boolean };
    expect(res.full ?? false).toBe(false);
  });
});

describe('crit. 3: remove', () => {
  it('a delete that touches 0 rows counts as success (already not in the menu)', async () => {
    deleteResult = { data: [], error: null, status: 200 };
    expect((await removeFromWeekMenu('x')).error).toBeNull();
  });

  it('a database error on remove is reported', async () => {
    deleteResult = { data: null, error: { code: '500', message: 'boom' }, status: 500 };
    expect((await removeFromWeekMenu('x')).error).not.toBeNull();
  });
});

describe('crit. 5: servings are validated before the call (1..99, whole numbers)', () => {
  it.each([0, 100, -1, 2.5, Number.NaN])('%s is refused without a database call', async (n) => {
    const res = await setWeekMenuServings('x', n);
    expect(res.error).not.toBeNull();
    expect(calls.update).toBe(0);
  });

  it.each([1, 5, 99])('%s is sent to the database', async (n) => {
    const res = await setWeekMenuServings('x', n);
    expect(res.error).toBeNull();
    expect(calls.update).toBe(1);
  });
});

describe('crit. 8: clear', () => {
  it('uses the rpc clear_week_menu (one transaction), not a delete without filter', async () => {
    expect((await clearWeekMenu()).error).toBeNull();
    expect(calls.rpc).toEqual(['clear_week_menu']);
  });

  it('an rpc error is reported', async () => {
    rpcResult = { error: { code: '500', message: 'boom' }, status: 500 };
    expect((await clearWeekMenu()).error).not.toBeNull();
  });
});

describe('crit. 7: order', () => {
  it('the menu is fetched newest first (created_at descending)', async () => {
    await fetchWeekMenu();
    expect(calls.order).toHaveLength(1);
    expect(calls.order[0][0]).toBe('created_at');
    expect(calls.order[0][1]).toMatchObject({ ascending: false });
  });
});

describe('crit. 12: texts', () => {
  const keys = ['nav.weekMenu', 'weekMenu.add', 'weekMenu.added', 'weekMenu.full', 'weekMenu.empty', 'weekMenu.tabMenu', 'weekMenu.tabShopping', 'weekMenu.clear', 'weekMenu.remove'];
  it('the key texts exist in both languages', () => {
    for (const k of keys) {
      expect(nl[k]?.length, `nl ${k}`).toBeGreaterThan(0);
      expect(fr[k]?.length, `fr ${k}`).toBeGreaterThan(0);
    }
  });

  it('nl has the wording of the requirement', () => {
    expect(nl['nav.weekMenu']).toBe('Weekmenu');
    expect(nl['weekMenu.add']).toBe('Aan weekmenu toevoegen');
    expect(nl['weekMenu.added']).toBe('In weekmenu');
    expect(nl['weekMenu.empty']).toBe('Je weekmenu is leeg.');
    expect(nl['weekMenu.tabMenu']).toBe('Menu');
    expect(nl['weekMenu.tabShopping']).toBe('Boodschappen');
    expect(fr['weekMenu.tabShopping']).toBe('Courses');
  });
});
