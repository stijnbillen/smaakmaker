// Central list of screens. Later tasks MUST add their screens here so that the
// 360 px and tap-target checks (R-001) cover them.
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

export const routes: AppRoute[] = [
  { name: 'overzicht', path: '/', auth: 'full' },
  { name: 'nieuw recept', path: '/nieuw', auth: 'full' },
  { name: 'favorieten', path: '/favorieten', auth: 'full' },
  { name: 'profiel', path: '/profiel', auth: 'full' },
  { name: 'uitnodigingen', path: '/uitnodigingen', auth: 'admin' },
  { name: 'aanmelden', path: '/aanmelden', auth: 'none' },
  { name: 'welkom', path: '/welkom', auth: 'unnamed' },
];

/** Screens that show the navigation bar. */
export const routesWithNav = routes.filter((r) => r.auth === 'full' || r.auth === 'admin');
