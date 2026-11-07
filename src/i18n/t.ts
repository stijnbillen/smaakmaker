import { useSyncExternalStore } from 'react';
import fr from './fr.json';
import { getLanguage, subscribe, type Language } from './language';
import nl from './nl.json';

export type TextKey = keyof typeof nl;

// A missing French key fails here, at compile time (tsc -b).
const texts: Record<Language, Record<TextKey, string>> = { nl, fr: fr satisfies Record<TextKey, string> };

/** Looks up a visible text by key in the current language; unknown keys fail at compile time. */
export function t(key: TextKey): string {
  return texts[getLanguage()][key];
}

/** Like t(), but in an explicit language (for text that must follow a parameter, not the global language). */
export function tIn(lang: Language, key: TextKey): string {
  return texts[lang][key];
}

/** Like t(), with {name} placeholders filled in (all occurrences). */
export function format(key: TextKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Subscribes a component to the language, so it renders again after a switch (state is kept). */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
