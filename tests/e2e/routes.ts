// Central list of screens. Later tasks MUST add their screens here so that the
// 360 px and tap-target checks (R-001) cover them.
export interface AppRoute {
  name: string;
  path: string;
}

export const routes: AppRoute[] = [
  { name: 'overzicht', path: '/' },
  { name: 'nieuw recept', path: '/nieuw' },
  { name: 'favorieten', path: '/favorieten' },
  { name: 'profiel', path: '/profiel' },
];
