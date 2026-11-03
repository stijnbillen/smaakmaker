import nl from './nl.json';

export type TextKey = keyof typeof nl;

/** Looks up a visible text by key; unknown keys fail at compile time. */
export function t(key: TextKey): string {
  return nl[key];
}
