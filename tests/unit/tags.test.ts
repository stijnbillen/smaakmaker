import { describe, expect, it } from 'vitest';
import { TAGS_MAX_ITEMS, TAG_NAME_MAX, addTag, tagKey, toggleTag, validateTagName } from '../../src/lib/tags';

// T-010 / R-010 crit. 3: a tag is 1-30 characters; a name that exists (case and accent insensitive) reuses the existing tag.
// The brief fixes names and boundaries, not the result shape of validateTagName: null/undefined/true-ish `ok` = valid.
const isValid = (r: unknown): boolean => {
  if (typeof r === 'boolean') return r;
  if (r === null || r === undefined) return true;
  if (typeof r === 'object' && 'ok' in (r as object)) return Boolean((r as { ok: unknown }).ok);
  return false; // an error code or message
};

describe('limits', () => {
  it('uses 30 characters per tag and 20 tags per recipe', () => {
    expect(TAG_NAME_MAX).toBe(30);
    expect(TAGS_MAX_ITEMS).toBe(20);
  });
});

describe('validateTagName (R-010 crit. 3: 1-30 characters after trimming)', () => {
  it.each([['empty', ''], ['spaces only', '   '], ['31 characters', 'a'.repeat(31)], ['31 characters with spaces around', `  ${'a'.repeat(31)}  `]])(
    'refuses %s',
    (_n, input) => {
      expect(isValid(validateTagName(input))).toBe(false);
    },
  );

  it.each([
    ['1 character', 'a'],
    ['30 characters', 'a'.repeat(30)],
    ['30 times "é" (code points, not bytes)', 'é'.repeat(30)],
    ['30 characters with spaces around', `  ${'a'.repeat(30)}  `],
  ])('accepts %s', (_n, input) => {
    expect(isValid(validateTagName(input))).toBe(true);
  });
});

describe('tagKey (R-010 crit. 3: case and accent insensitive)', () => {
  it('gives "Soep", " SOEP " and "sóep" the same key', () => {
    expect(tagKey('Soep')).toBe(tagKey(' SOEP '));
    expect(tagKey('Soep')).toBe(tagKey('sóep'));
  });

  it('gives "Crème" and "creme" the same key', () => {
    expect(tagKey('Crème')).toBe(tagKey('creme'));
  });

  it('keeps "Soep" and "Soepen" apart', () => {
    expect(tagKey('Soep')).not.toBe(tagKey('Soepen'));
  });
});

describe('addTag (R-010 crit. 3: no duplicate tag)', () => {
  const catalog = ['dessert', 'soep', 'tapas'];

  it('"DESSERT" selects the existing "dessert" with the spelling of the catalogue', () => {
    expect(addTag([], catalog, 'DESSERT')).toEqual(['dessert']);
  });

  it('leaves the list unchanged when the tag is already selected', () => {
    expect(addTag(['soep'], catalog, ' Soep ')).toEqual(['soep']);
  });

  it('adds an unknown name trimmed', () => {
    expect(addTag(['soep'], catalog, '  Stoofpot ')).toEqual(['soep', 'Stoofpot']);
  });

  it('matches accent-insensitively against the catalogue', () => {
    expect(addTag([], ['crème'], 'CREME')).toEqual(['crème']);
  });
});

describe('toggleTag (R-010 crit. 2)', () => {
  it('adds a missing tag and removes a present one', () => {
    expect(toggleTag([], 'soep')).toEqual(['soep']);
    expect(toggleTag(['soep', 'tapas'], 'soep')).toEqual(['tapas']);
  });
});
