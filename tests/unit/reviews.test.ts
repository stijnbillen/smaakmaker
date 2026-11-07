import { afterEach, describe, expect, it } from 'vitest';
import fr from '../../src/i18n/fr.json';
import nlJson from '../../src/i18n/nl.json';
import { resetLanguage, useLanguage } from '../helpers/language';
import { canDeleteReview, canEditReview } from '../../src/lib/permissions';
import { formatRating, MAX_REVIEW_LENGTH, parseSort, reviewCountText, toSearchParams, validateReview } from '../../src/lib/reviews';

// T-016 / R-012 logic.
describe('validateReview (crit. 1 and 2)', () => {
  it('requires a score', () => {
    expect(validateReview({ rating: null, body: '' }).rating).toBeDefined();
  });
  it('refuses 0 and 6', () => {
    expect(validateReview({ rating: 0, body: '' }).rating).toBeDefined();
    expect(validateReview({ rating: 6, body: '' }).rating).toBeDefined();
  });
  it('accepts 1 to 5', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(validateReview({ rating: n, body: '' }).rating, String(n)).toBeUndefined();
  });
  it('accepts 500 characters, refuses 501', () => {
    expect(MAX_REVIEW_LENGTH).toBe(500);
    expect(validateReview({ rating: 3, body: 'a'.repeat(500) }).body).toBeUndefined();
    expect(validateReview({ rating: 3, body: 'a'.repeat(501) }).body).toBeDefined();
  });
  it('counts code points, not UTF-16 units', () => {
    expect(validateReview({ rating: 3, body: '😀'.repeat(500) }).body).toBeUndefined();
    expect(validateReview({ rating: 3, body: '😀'.repeat(501) }).body).toBeDefined();
  });
  it('counts after trimming', () => {
    expect(validateReview({ rating: 3, body: '  ' + 'a'.repeat(500) + '  ' }).body).toBeUndefined();
  });
  it('treats an empty or blank body as valid (optional)', () => {
    expect(validateReview({ rating: 3, body: '   ' }).body).toBeUndefined();
  });
});

// R-026 crit. 6: rating "4,3" with a comma in both languages.
describe('formatRating per language (R-026 crit. 6)', () => {
  afterEach(resetLanguage);

  it.each([
    [4.25, '4,3'],
    [4, '4,0'],
    [3.04, '3,0'],
  ])('formatRating(%s) is "%s" in nl and in fr', (n, text) => {
    useLanguage('nl');
    expect(formatRating(n)).toBe(text);
    useLanguage('fr');
    expect(formatRating(n)).toBe(text);
  });

  it('reviewCountText follows the language', () => {
    useLanguage('fr');
    expect(reviewCountText(1)).toBe(fr['reviews.countOne']);
    expect(reviewCountText(3)).toBe(fr['reviews.countMany'].replace('{n}', '3'));
  });
});

describe('formatRating and reviewCountText (crit. 4)', () => {
  it('always shows one decimal with a comma', () => {
    expect(formatRating(4.3)).toBe('4,3');
    expect(formatRating(4)).toBe('4,0');
  });
  it('uses singular for 1 and plural otherwise', () => {
    expect(reviewCountText(1)).toBe('1 review');
    expect(reviewCountText(3)).toBe('3 reviews');
  });
});

describe('canEditReview / canDeleteReview (crit. 7)', () => {
  const review = { authorId: 'a' };
  it('author edits and deletes', () => {
    expect(canEditReview(review, { userId: 'a' })).toBe(true);
    expect(canDeleteReview(review, { userId: 'a', isAdmin: false })).toBe(true);
  });
  it('administrator deletes but does not edit', () => {
    expect(canEditReview(review, { userId: 'x', isAdmin: true } as never)).toBe(false);
    expect(canDeleteReview(review, { userId: 'x', isAdmin: true })).toBe(true);
  });
  it('another user can do neither', () => {
    expect(canEditReview(review, { userId: 'b' })).toBe(false);
    expect(canDeleteReview(review, { userId: 'b', isAdmin: false })).toBe(false);
  });
  it('nobody signed in can do neither', () => {
    expect(canEditReview(review, { userId: null as unknown as string })).toBe(false);
    expect(canDeleteReview(review, { userId: null, isAdmin: false })).toBe(false);
  });
});

// Crit. 5: the sort lives in the URL as ?sorteer=beoordeling; an unknown value means the default.
describe('sort parameter (crit. 5)', () => {
  it('puts the rating sort in the URL and reads it back', () => {
    const rating = parseSort(new URLSearchParams('sorteer=beoordeling'));
    const params = toSearchParams(rating, new URLSearchParams());
    expect(params.get('sorteer')).toBe('beoordeling');
    expect(parseSort(params)).toBe(rating);
  });
  it('falls back to the default for an unknown value', () => {
    expect(parseSort(new URLSearchParams('sorteer=onzin'))).toBe(parseSort(new URLSearchParams()));
  });
  it('differs between default and rating', () => {
    expect(parseSort(new URLSearchParams('sorteer=beoordeling'))).not.toBe(parseSort(new URLSearchParams()));
  });
  it('keeps other filters when the sort changes', () => {
    const base = new URLSearchParams('soort=hoofd&gerief=oven');
    const params = toSearchParams(parseSort(new URLSearchParams('sorteer=beoordeling')), base);
    expect(params.get('soort')).toBe('hoofd');
    expect(params.get('gerief')).toBe('oven');
  });
});

// R-001 / R-012: all visible texts live in nl.json.
describe('nl.json review texts', () => {
  const nl = nlJson as Record<string, string>;
  const expected: Record<string, string> = {
    'reviews.none': 'Nog geen reviews',
    'reviews.write': 'Review schrijven',
    'reviews.rating': 'Score',
    'reviews.body': 'Tekst (optioneel)',
    'reviews.bodyCount': '{n}/500',
    'reviews.save': 'Opslaan',
    'reviews.edit': 'Bewerken',
    'reviews.delete': 'Verwijderen',
    'reviews.deleteQuestion': 'Deze review verwijderen?',
    'reviews.errorRating': 'Kies een score.',
    'reviews.errorBody': 'Hoogstens 500 tekens.',
    'reviews.duplicate': 'Je hebt dit recept al beoordeeld.',
    'reviews.deleteFailed': 'Verwijderen mislukt.',
    'overview.sort': 'Sorteren',
    'overview.sortNewest': 'Nieuwste',
    'overview.sortRating': 'Beoordeling',
  };
  for (const [key, text] of Object.entries(expected)) {
    it(key + ' = ' + text, () => expect(nl[key]).toBe(text));
  }
});
