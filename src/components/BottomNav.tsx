import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t, type TextKey } from '../i18n/t';

// Icons are decorative (aria-hidden); the visible label carries the meaning. currentColor follows the link colour.
const icons = {
  recipes: <path d="M4 5h16M4 12h16M4 19h16" />,
  favorites: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  add: <path d="M12 5v14M5 12h14" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

const entries: { to: string; label: TextKey; icon: keyof typeof icons }[] = [
  { to: '/', label: 'nav.recipes', icon: 'recipes' },
  { to: '/favorieten', label: 'nav.favorites', icon: 'favorites' },
  { to: '/nieuw', label: 'nav.new', icon: 'add' },
  { to: '/profiel', label: 'nav.profile', icon: 'profile' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const isActive = (to: string) => pathname === to || (to === '/profiel' && pathname === '/uitnodigingen');
  return (
    <nav className="bottom-nav" aria-label={t('nav.label')}>
      <ul>
        {entries.map((e) => (
          <li key={e.to}>
            {/* Own active check (not NavLink): invites hang under Profiel, so the bar keeps four entries. */}
            <Link to={e.to} aria-current={isActive(e.to) ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {icons[e.icon]}
              </svg>
              <span>{t(e.label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
