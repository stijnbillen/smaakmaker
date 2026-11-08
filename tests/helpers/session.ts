import type { Page } from '@playwright/test';
import type { Session } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase-admin';

/**
 * Sign-in screen comes with R-002, so e2e tests place a supabase-js session in
 * localStorage directly (key format: sb-<first hostname label>-auth-token).
 */
export function storageKey(): string {
  return `sb-${new URL(supabaseUrl()).hostname.split('.')[0]}-auth-token`;
}

export async function signInViaStorage(page: Page, session: Session): Promise<void> {
  const key = storageKey();
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [key, JSON.stringify(session)] as [string, string],
  );
}

/** Chooses the interface language before the app starts (same storage key as src/i18n/language.ts). */
export async function seedLanguage(page: Page, lang: 'nl' | 'fr'): Promise<void> {
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['smaakmaker.lang', lang] as [string, string]);
}

/** Opens a screen with the session its route needs (see `AppRoute.auth`). */
export async function signInForRoute(
  page: Page,
  auth: 'full' | 'none' | 'unnamed' | 'admin',
  sessions: { full: Session; unnamed: Session; admin: Session },
): Promise<void> {
  if (auth === 'none') return;
  const session = auth === 'full' ? sessions.full : auth === 'admin' ? sessions.admin : sessions.unnamed;
  await signInViaStorage(page, session);
}

/** Matches every request to the (local) Supabase backend, not the app's own origin. */
export function supabaseRoutePattern(): string {
  return `${supabaseUrl()}/**`;
}
