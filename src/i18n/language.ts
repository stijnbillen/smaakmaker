import fr from './fr.json';
import nl from './nl.json';

export type Language = 'nl' | 'fr';

const STORAGE_KEY = 'smaakmaker.lang';

// Dutch until initLanguage() runs: unit tests in Node must not follow the language of Node itself.
let current: Language = 'nl';
const listeners = new Set<() => void>();

const isLanguage = (value: unknown): value is Language => value === 'nl' || value === 'fr';

/** Only the first preferred language counts; "starts with fr" (any case) is French, everything else Dutch. */
export function detectLanguage(languages: readonly string[]): Language {
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'nl';
}

/** Saved choice first (an invalid or retired value counts as no choice), then the browser language. */
export function loadLanguage(): Language {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage unusable (private mode): fall through to the browser language.
  }
  if (typeof navigator === 'undefined') return 'nl';
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? '']);
}

export const getLanguage = (): Language => current;

/** Locale for numbers and dates. The time zone stays Europe/Brussels (see format.ts). */
export const locale = (): string => (current === 'nl' ? 'nl-BE' : 'fr-BE');

/** Switches at once (no reload), saves the choice when storage allows, and updates <html lang> and the title. */
export function setLanguage(lang: Language): void {
  current = lang;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not saved, but the switch itself still works until the next reload.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = (lang === 'nl' ? nl : fr)['app.title'];
  }
  listeners.forEach((listener) => listener());
}

/** Called once before the first render. Does not save: only an explicit choice is stored. */
export function initLanguage(): void {
  const lang = loadLanguage();
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = (lang === 'nl' ? nl : fr)['app.title'];
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
