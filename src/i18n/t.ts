import { useSyncExternalStore } from 'react';
import en from './en.json';
import { getLanguage, subscribe } from './language';
import nl from './nl.json';

export type TextKey = keyof typeof nl;

// A missing English key fails here, at compile time (tsc -b).
const texts: Record<'nl' | 'en', Record<TextKey, string>> = { nl, en: en satisfies Record<TextKey, string> };

/** Looks up a visible text by key in the current language; unknown keys fail at compile time. */
export function t(key: TextKey): string {
  return texts[getLanguage()][key];
}

/** Like t(), with {name} placeholders filled in (all occurrences). */
export function format(key: TextKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Subscribes a component to the language, so it renders again after a switch (state is kept). */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
