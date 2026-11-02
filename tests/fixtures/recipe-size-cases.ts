// T-013 / R-004 crit. 1: one set of cases with the expected number of UTF-8 bytes of the text fields.
// Used by the unit test (recipeTextBytes) and the database test (recipe_text_bytes), so both counts stay equal.
// Numbers (times, servings, quantities) and the JSON structure do not count.

export interface SizeCase {
  name: string;
  title: string;
  ingredients: { name: string; unit?: string }[];
  steps: string[];
  source?: string;
  note?: string;
  dishTags?: string[];
  traitTags?: string[];
  equipment?: string[];
  /** Expected UTF-8 bytes, computed by hand (see the sums beside each case). */
  bytes: number;
}

export const SIZE_CASES: SizeCase[] = [
  {
    name: 'plain ascii, no source and note',
    title: 'abc', // 3
    ingredients: [{ name: 'Zout', unit: 'g' }], // 4 + 1
    steps: ['Roer.'], // 5
    bytes: 13,
  },
  {
    name: 'accents and euro sign in every kind of field',
    title: 'Crème brûlée', // 12 chars, 3 two-byte = 15
    ingredients: [{ name: 'Suiker', unit: 'el' }], // 6 + 2
    steps: ['Verwarm'], // 7
    source: 'é', // 2
    note: '€', // 3
    bytes: 35,
  },
  {
    name: 'emoji, tags and equipment',
    title: '🍅', // 4
    ingredients: [{ name: 'Tomaat' }], // 6
    steps: ['🍅🍅'], // 8
    note: '€€', // 6
    dishTags: ['Proeftag'], // 8
    traitTags: ['Proefkenmerk'], // 12
    equipment: ['Pan'], // 3
    bytes: 47,
  },
  {
    name: 'several ingredients and steps',
    title: 'é', // 2
    ingredients: [
      { name: 'a', unit: 'b' }, // 2
      { name: 'ü' }, // 2
    ],
    steps: ['x', '€', '🍅'], // 1 + 3 + 4
    bytes: 14,
  },
];
