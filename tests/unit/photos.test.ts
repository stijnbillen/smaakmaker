import { describe, expect, it } from 'vitest';
import {
  addPhotos,
  draftFromRecord,
  emptyDraft,
  isDirty,
  MAX_PHOTOS,
  moveItem,
  removeItem,
  removePhoto,
  setMain,
  validateRecipe,
  type PhotoDraft,
  type RecipeDraft,
} from '../../src/lib/recipe';

// T-012 / R-005 crit. 1, 5 and 6 (pure part). Assumed shapes, from plan step 7:
// PhotoDraft = { key, path?, blob?, previewUrl, main }; addPhotos(list, incoming) -> { photos, rejected };
// setMain(list, i) and removePhoto(list, i) -> new list. Incoming photos are PhotoDrafts with main false.
let n = 0;
const photo = (main = false): PhotoDraft => ({ key: `k${++n}`, previewUrl: `blob:test/${n}`, blob: new Blob([`x${n}`]), main });
const stored = (key: string, main = false): PhotoDraft => ({ key, path: `r/${key}.jpg`, previewUrl: '', main });
const mains = (list: PhotoDraft[]): number[] => list.flatMap((p, i) => (p.main ? [i] : []));

const validDraft = (photos: PhotoDraft[]): RecipeDraft =>
  ({
    ...emptyDraft(),
    title: 'Linzensoep',
    prepMinutes: '10',
    totalMinutes: '20',
    servings: '4',
    ingredients: [{ name: 'Linzen', quantity: '', unit: '' }],
    steps: ['Kook.'],
    photos,
  }) as RecipeDraft;

describe('crit. 1: at most 3 photos', () => {
  it('MAX_PHOTOS is 3', () => expect(MAX_PHOTOS).toBe(3));

  it('2 existing + 2 new -> 3 photos, 1 rejected', () => {
    const res = addPhotos([photo(true), photo()], [photo(), photo()]);
    expect(res.photos).toHaveLength(3);
    expect(res.rejected).toBe(1);
  });

  it('with 3 existing nothing is added', () => {
    const list = [photo(true), photo(), photo()];
    const res = addPhotos(list, [photo()]);
    expect(res.photos).toHaveLength(3);
    expect(res.photos.map((p) => p.key)).toEqual(list.map((p) => p.key));
    expect(res.rejected).toBe(1);
  });

  it('4 at once on an empty list: the first 3 are kept, 1 rejected', () => {
    const incoming = [photo(), photo(), photo(), photo()];
    const res = addPhotos([], incoming);
    expect(res.photos.map((p) => p.key)).toEqual(incoming.slice(0, 3).map((p) => p.key));
    expect(res.rejected).toBe(1);
  });

  it('fitting photos give rejected 0 and do not change the input list', () => {
    const list = [photo(true)];
    const res = addPhotos(list, [photo()]);
    expect(res.rejected).toBe(0);
    expect(list).toHaveLength(1);
  });

  it('validateRecipe: 4 photos -> errors.photos = photosTooMany; 3 are fine', () => {
    const four = validateRecipe(validDraft([photo(true), photo(), photo(), photo()]));
    expect(four.ok).toBe(false);
    expect(four.errors.photos).toBe('photosTooMany');
    const three = validateRecipe(validDraft([photo(true), photo(), photo()]));
    expect(three.ok).toBe(true);
    expect(three.errors.photos).toBeUndefined();
  });

  it('validateRecipe: 0 photos and a draft without the photos field are fine', () => {
    expect(validateRecipe(validDraft([])).ok).toBe(true);
    const { photos: _omit, ...without } = validDraft([]);
    expect(validateRecipe(without as RecipeDraft).ok).toBe(true);
  });
});

describe('crit. 5: main photo', () => {
  it('the first added photo becomes the main photo', () => {
    const res = addPhotos([], [photo(), photo()]);
    expect(mains(res.photos)).toEqual([0]);
  });

  it('adding to a list that has a main photo keeps that one', () => {
    const res = addPhotos([photo(false), photo(true)], [photo()]);
    expect(mains(res.photos)).toEqual([1]);
  });

  it('setMain makes exactly one main photo', () => {
    const out = setMain([photo(true), photo(), photo()], 2);
    expect(mains(out)).toEqual([2]);
  });

  it('removing the main photo makes the new first photo main', () => {
    const out = removePhoto([photo(false), photo(true), photo()], 1);
    expect(out).toHaveLength(2);
    expect(mains(out)).toEqual([0]);
  });

  it('removing a non-main photo keeps the main photo', () => {
    const list = [photo(true), photo(), photo()];
    const keyOfMain = list[0].key;
    const out = removePhoto(list, 2);
    expect(out.find((p) => p.main)?.key).toBe(keyOfMain);
    expect(mains(out)).toHaveLength(1);
  });

  it('removing the last photo gives an empty list', () => {
    expect(removePhoto([photo(true)], 0)).toEqual([]);
  });

  it('reordering does not change which photo is main', () => {
    const list = [photo(true), photo(), photo()];
    const mainKey = list[0].key;
    const moved = moveItem(list, 0, 1);
    expect(moved.find((p) => p.main)?.key).toBe(mainKey);
    expect(mains(moved)).toEqual([1]);
  });
});

describe('crit. 6: order and removal use the generic helpers', () => {
  it('moveItem swaps neighbours and does nothing past the ends (photo list)', () => {
    const [a, b, c] = [photo(true), photo(), photo()];
    expect(moveItem([a, b, c], 1, -1).map((p) => p.key)).toEqual([b.key, a.key, c.key]);
    expect(moveItem([a, b, c], 0, -1).map((p) => p.key)).toEqual([a.key, b.key, c.key]);
  });

  it('removeItem drops one photo', () => {
    const [a, b] = [photo(true), photo()];
    expect(removeItem([a, b], 0).map((p) => p.key)).toEqual([b.key]);
  });
});

describe('form state with photos (crit. 6: add/remove/reorder makes the form "changed")', () => {
  it('emptyDraft starts with no photos', () => {
    expect(emptyDraft().photos ?? []).toEqual([]);
  });

  it('draftFromRecord keeps the stored photos in order, with their paths and main flag', () => {
    const record = {
      title: 'Soep',
      ingredients: [{ name: 'Water' }],
      steps: ['Kook.'],
      photos: [
        { path: 'r/a.jpg', main: false },
        { path: 'r/b.jpg', main: true },
      ],
    };
    const d = draftFromRecord(record as never);
    expect(d.photos?.map((p) => p.path)).toEqual(['r/a.jpg', 'r/b.jpg']);
    expect(d.photos?.map((p) => p.main)).toEqual([false, true]);
  });

  it('an untouched photo list is not dirty', () => {
    const list = [stored('a', true), stored('b')];
    expect(isDirty(validDraft(list), validDraft([...list]))).toBe(false);
  });

  it('adding, removing, reordering and changing main all count as dirty', () => {
    const base = [stored('a', true), stored('b')];
    expect(isDirty(validDraft(base), validDraft([...base, stored('c')]))).toBe(true);
    expect(isDirty(validDraft(base), validDraft([base[0]]))).toBe(true);
    expect(isDirty(validDraft(base), validDraft(moveItem(base, 0, 1)))).toBe(true);
    expect(isDirty(validDraft(base), validDraft(setMain(base, 1)))).toBe(true);
  });

  it('two different new photos (blobs) are not "equal": compared on key, not on JSON of the blob', () => {
    const a = { key: 'new1', previewUrl: 'blob:1', blob: new Blob(['aaa']), main: true };
    const b = { key: 'new2', previewUrl: 'blob:2', blob: new Blob(['bbbbbb']), main: true };
    expect(isDirty(validDraft([a]), validDraft([b]))).toBe(true);
    expect(isDirty(validDraft([a]), validDraft([{ ...a }]))).toBe(false);
  });

  it('a new photo in an otherwise empty draft is dirty', () => {
    expect(isDirty(validDraft([]), validDraft([photo(true)]))).toBe(true);
  });
});
