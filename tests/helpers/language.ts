import { vi } from 'vitest';
import { setLanguage, type Language } from '../../src/i18n/language';

// Unit-test helper (T-018): switch the app language without a browser. Call `resetLanguage()` in afterEach,
// because module state is shared between test files (vitest isolate:false).

export function useLanguage(lang: Language): void {
  vi.stubGlobal('document', { documentElement: { lang: '' }, title: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  setLanguage(lang);
}

export function resetLanguage(): void {
  setLanguage('nl');
  vi.unstubAllGlobals();
}
