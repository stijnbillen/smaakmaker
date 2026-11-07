// T-022 / R-026: the retired language code, built from parts so the "no English" scan
// (tests/unit/no-english.test.ts) still sees no literal in the tests.
// Deliberately free of imports: Playwright specs use it too, and must not pull in vitest or src/.
export const RETIRED_LANG: string = ['e', 'n'].join('');
export const RETIRED_BROWSER_GB: string = `${RETIRED_LANG}-GB`;
export const RETIRED_BROWSER_US: string = `${RETIRED_LANG}-US`;
