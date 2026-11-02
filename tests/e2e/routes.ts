// Central list of screens. Later tasks MUST add their screens here so that the
// 360 px and tap-target checks (R-001) cover them.
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertRecipe } from '../helpers/supabase-admin';

export interface AppRoute {
  name: string;
  path: string;
  /**
   * Session the screen is opened with:
   * - 'full': signed in with a display name (default screens, with navigation bar)
   * - 'none': no session (sign-in screen, no navigation bar)
   * - 'unnamed': signed in but no display name yet (welcome screen, no navigation bar)
   * - 'admin': signed in as administrator with a display name (T-004; navigation bar)
   */
  auth: 'full' | 'none' | 'unnamed' | 'admin';
}

/**
 * Screens with an id in the path need a recipe of the test user (T-005).
 * A spec calls `prepareRoutes(user.client)` in its beforeAll; `path` is then filled in.
 */
const fixture = { recipeId: 'nog-niet-klaargezet' };

export async function prepareRoutes(client: SupabaseClient): Promise<void> {
  fixture.recipeId = (await insertRecipe(client, { title: 'Routetest recept' })).id;
}

export const routes: AppRoute[] = [
  { name: 'overzicht', path: '/', auth: 'full' },
  { name: 'nieuw recept', path: '/nieuw', auth: 'full' },
  {
    name: 'recept',
    get path() {
      return `/recept/${fixture.recipeId}`;
    },
    auth: 'full',
  },
  {
    name: 'recept bewerken',
    get path() {
      return `/recept/${fixture.recipeId}/bewerken`;
    },
    auth: 'full',
  },
  { name: 'favorieten', path: '/favorieten', auth: 'full' },
  { name: 'profiel', path: '/profiel', auth: 'full' },
  { name: 'uitnodigingen', path: '/uitnodigingen', auth: 'admin' },
  { name: 'aanmelden', path: '/aanmelden', auth: 'none' },
  { name: 'welkom', path: '/welkom', auth: 'unnamed' },
];

/** Screens that show the navigation bar. */
export const routesWithNav = routes.filter((r) => r.auth === 'full' || r.auth === 'admin');
