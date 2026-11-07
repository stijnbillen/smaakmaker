// T-022 / R-026: English catalogue terms of the old starting list. They are assembled from parts so that
// the "no English" scan (tests/unit/no-english.test.ts) finds no literal in the tests, this file included.
const w = (...parts: string[]): string => parts.join('');

export const ENGLISH_INGREDIENT_TERMS: string[] = [w('to', 'mato'), w('po', 'tato'), w('on', 'ion')];

/** The English word for a single item is not here: it is the accent-free key of the French "pièce". */
export const ENGLISH_UNIT_TERMS: string[] = [w('table', 'spoon'), w('tea', 'spoon'), w('pi', 'nch'), w('clo', 've'), w('bun', 'ch')];

/** Every term the scan looks for as a string literal in tests and sources. */
export const ENGLISH_SCAN_TERMS: string[] = [...ENGLISH_INGREDIENT_TERMS, ...ENGLISH_UNIT_TERMS, w('pie', 'ce')];
