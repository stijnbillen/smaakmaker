import { describe, expect, it } from 'vitest';
import { draftFromRecord, isDirty, type RecipeRecord } from '../../src/lib/recipe';
import { familyView, isVariant, variantDraft, variantSourceLine } from '../../src/lib/variant';
import nl from '../../src/i18n/nl.json';

// T-014 / R-006. Pure logic of variants; the database and interface parts live in tests/db and tests/e2e.

const record: RecipeRecord = {
  id: 'src-1',
  authorId: 'user-a',
  authorName: 'A',
  createdAt: '2026-01-01T00:00:00Z',
  title: 'Soep met feta',
  ingredients: [
    { name: 'Feta', quantity: 200, unit: 'g' },
    { name: 'Water', quantity: 1.5, unit: 'l' },
    { name: 'Zout' },
  ],
  steps: ['Kook.', 'Meng.'],
  prepMinutes: 15,
  totalMinutes: 45,
  servings: 4,
  source: 'Oma',
  note: 'Met brood',
  equipment: ['Pan'],
  dishTags: ['Soep', 'Vegetarisch'],
  traitTags: ['Snel', 'Winter'],
  photos: [
    { path: 'src-1/a.jpg', main: false },
    { path: 'src-1/b.jpg', main: true },
  ],
  variantOf: null,
  familyId: 'src-1',
  sourceTitle: null,
} as unknown as RecipeRecord;

const sizes = new Map([
  ['src-1/a.jpg', 1000],
  ['src-1/b.jpg', 2000],
]);

describe('variantDraft (crit. 1: copy of all fields and photos)', () => {
  const draft = variantDraft(record, sizes);
  const plain = draftFromRecord(record, sizes);

  it('copies the text fields, times, servings, source, note, equipment and both tag groups', () => {
    expect(draft.title).toBe(plain.title);
    expect(draft.ingredients).toEqual(plain.ingredients);
    expect(draft.steps).toEqual(plain.steps);
    expect(draft.prepMinutes).toBe('15');
    expect(draft.totalMinutes).toBe('45');
    expect(draft.servings).toBe('4');
    expect(draft.source).toBe('Oma');
    expect(draft.note).toBe('Met brood');
    expect(draft.equipment).toEqual(['Pan']);
    expect(draft.dishTags).toEqual(['Soep', 'Vegetarisch']);
    expect(draft.traitTags).toEqual(['Snel', 'Winter']);
  });

  it('keeps ingredient order and quantities as the form shows them', () => {
    expect(draft.ingredients.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ['Feta', '200', 'g'],
      ['Water', '1,5', 'l'],
      ['Zout', '', ''],
    ]);
  });

  it('turns every photo into a copy-to-do: copyFrom = source path, no path, no blob, same order and main, bytes from the folder', () => {
    const photos = draft.photos ?? [];
    expect(photos).toHaveLength(2);
    expect(photos.map((p) => p.copyFrom)).toEqual(['src-1/a.jpg', 'src-1/b.jpg']);
    expect(photos.map((p) => p.main)).toEqual([false, true]);
    expect(photos.map((p) => p.bytes)).toEqual([1000, 2000]);
    for (const p of photos) {
      expect(p.path).toBeUndefined();
      expect(p.blob).toBeUndefined();
    }
  });

  it('does not put the source id or the family in the draft', () => {
    const json = JSON.stringify(draft);
    expect(json).not.toContain('variantOf');
    expect(json).not.toContain('familyId');
    expect(json).not.toContain('variant_of');
    expect(json).not.toContain('family_id');
  });

  it('does not change the record it copies from', () => {
    const before = JSON.stringify(record);
    variantDraft(record, sizes);
    expect(JSON.stringify(record)).toBe(before);
  });

  it('copies a record without photos', () => {
    const d = variantDraft({ ...record, photos: [] }, new Map());
    expect(d.photos ?? []).toEqual([]);
  });
});

describe('isDirty with a variant draft (crit. 2: nothing changed = nothing to discard)', () => {
  it('is false for two drafts of the same record', () => {
    expect(isDirty(variantDraft(record, sizes), variantDraft(record, sizes))).toBe(false);
  });

  it('ignores copyFrom and bytes', () => {
    const a = variantDraft(record, sizes);
    const b = variantDraft(record, new Map());
    b.photos = (b.photos ?? []).map((p) => ({ ...p, copyFrom: `other/${p.key}`, bytes: 1 }));
    expect(isDirty(a, b)).toBe(false);
  });

  it('is true after a title change, a removed photo or another main photo', () => {
    const a = variantDraft(record, sizes);
    expect(isDirty(a, { ...a, title: 'Andere' })).toBe(true);
    expect(isDirty(a, { ...a, photos: (a.photos ?? []).slice(1) })).toBe(true);
    expect(isDirty(a, { ...a, photos: (a.photos ?? []).map((p) => ({ ...p, main: !p.main })) })).toBe(true);
  });
});

describe('familyView (crit. 6 and 7)', () => {
  const m = (id: string, variantOf: string | null, at: string, name = id) => ({
    id,
    title: `Recept ${id}`,
    variant_of: variantOf,
    created_at: at,
    author: { display_name: name },
  });
  // A -> B -> C and A -> D, as returned by one family query (oldest first).
  const members = [
    m('A', null, '2026-01-01T00:00:00Z'),
    m('B', 'A', '2026-01-02T00:00:00Z'),
    m('C', 'B', '2026-01-03T00:00:00Z'),
    m('D', 'A', '2026-01-04T00:00:00Z'),
  ];

  it('gives the direct variants only (variant_of = current)', () => {
    expect(familyView(members, 'A').direct.map((x) => x.id)).toEqual(['B', 'D']);
    expect(familyView(members, 'B').direct.map((x) => x.id)).toEqual(['C']);
    expect(familyView(members, 'C').direct).toEqual([]);
  });

  it('gives the whole family, in the given order, with n = number of members (current one included)', () => {
    for (const id of ['A', 'B', 'C', 'D']) {
      const view = familyView(members, id);
      expect(view.all.map((x) => x.id)).toEqual(['A', 'B', 'C', 'D']);
      expect(view.n).toBe(4);
    }
  });

  it('keeps members whose source is gone (variant_of null) in the family', () => {
    const after = [m('B', null, '2026-01-02T00:00:00Z'), m('C', 'B', '2026-01-03T00:00:00Z'), m('D', null, '2026-01-04T00:00:00Z')];
    const view = familyView(after, 'B');
    expect(view.n).toBe(3);
    expect(view.all.map((x) => x.id)).toEqual(['B', 'C', 'D']);
    expect(view.direct.map((x) => x.id)).toEqual(['C']);
  });

  it('a lone recipe has n = 1 and no direct variants', () => {
    const view = familyView([m('X', null, '2026-01-01T00:00:00Z')], 'X');
    expect(view.n).toBe(1);
    expect(view.direct).toEqual([]);
  });
});

describe('variantSourceLine (crit. 5 and 9)', () => {
  it('"bron" when variant_of points at a recipe', () => {
    expect(variantSourceLine('src', 'fam', 'me', 'Titel')).toBe('bron');
  });
  it('"verwijderd" when it was made as a variant (family differs from id) but the source is gone', () => {
    expect(variantSourceLine(null, 'fam', 'me', null)).toBe('verwijderd');
  });
  it('"geen" for a recipe that is no variant', () => {
    expect(variantSourceLine(null, 'me', 'me', null)).toBe('geen');
  });
});

describe('isVariant (crit. 11: family_id !== id)', () => {
  it('is true when the family is not the own id, also without a source', () => {
    expect(isVariant({ id: 'b', family_id: 'a' })).toBe(true);
  });
  it('is false for a root recipe', () => {
    expect(isVariant({ id: 'a', family_id: 'a' })).toBe(false);
  });
});

describe('nl.json texts of T-014 (R-001, R-016)', () => {
  const flat = nl as Record<string, string>;
  const expected: Record<string, string> = {
    'variant.make': 'Maak een variant',
    'variant.formTitle': 'Variant maken',
    'variant.of': 'Variant van:',
    'variant.ofDeleted': 'Variant van een verwijderd recept',
    'variant.list': 'Varianten',
    'variant.family': 'Alle varianten ({n})',
    'variant.current': '(dit recept)',
    'variant.label': 'Variant',
    'variant.sourceGone': 'Het bronrecept is intussen verwijderd. Je variant is niet bewaard.',
  };
  for (const [key, text] of Object.entries(expected)) {
    it(`${key} = ${text}`, () => expect(flat[key]).toBe(text));
  }
});
