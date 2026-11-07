import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { t, useLanguage } from '../i18n/t';
import { signOut } from '../lib/auth';

export function ProfilePage() {
  useLanguage();
  const { displayName, isAdmin } = useAuth();
  return (
    <main className="page">
      <h1>{t('profile.title')}</h1>
      <p className="profile-name">{displayName}</p>
      {isAdmin && (
        <Link className="button-link button-link--quiet" to="/uitnodigingen">
          {t('profile.invitesLink')}
        </Link>
      )}
      {isAdmin && (
        <Link className="button-link button-link--quiet" to="/databank">
          {t('profile.catalogLink')}
        </Link>
      )}
      <LanguageSwitch />
      {/* The auth state change then sends the user to the sign-in screen. */}
      <button type="button" onClick={() => void signOut()}>
        {t('profile.signOut')}
      </button>
    </main>
  );
}
