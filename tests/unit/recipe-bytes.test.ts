import { describe, expect, it } from 'vitest';
import { draftFromRecord, emptyDraft, isDirty } from '../../src/lib/recipe';

// T-013 / R-004 crit. 4: stored photos carry their size so the form can show the used size.
describe('photo bytes in isDirty and draftFromRecord (R-004 crit. 4)', () => {
  const photo = (bytes?: number) => ({ key: 'p1', path: 'p1', previewUrl: '', main: true, ...(bytes === undefined ? {} : { bytes }) });
  const record = (photos: { path: string; main: boolean }[]) => ({
    title: 'Soep',
    ingredients: [{ name: 'Water' }],
    steps: ['Kook.'],
    source: null,
    note: null,
    photos,
  });

  it('isDirty ignores bytes: loading the sizes later does not make the form "changed"', () => {
    const a = { ...emptyDraft(), title: 'Soep', photos: [photo()] };
    const b = { ...emptyDraft(), title: 'Soep', photos: [photo(12345)] };
    expect(isDirty(a, b)).toBe(false);
  });

  it('draftFromRecord takes the size of a stored photo from the optional map (path -> bytes)', () => {
    const draft = draftFromRecord(
      record([{ path: 'x/1.jpg', main: true }, { path: 'x/2.jpg', main: false }]) as never,
      new Map([['x/1.jpg', 111], ['x/2.jpg', 222]]) as never,
    );
    expect(draft.photos?.map((p) => p.bytes)).toEqual([111, 222]);
  });

  it('draftFromRecord without a map leaves bytes undefined', () => {
    const draft = draftFromRecord(record([{ path: 'x/1.jpg', main: true }]) as never);
    expect(draft.photos?.[0].bytes).toBeUndefined();
  });
});
