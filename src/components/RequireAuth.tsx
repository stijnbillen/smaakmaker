import { Navigate, Outlet } from 'react-router-dom';
import { t, useLanguage } from '../i18n/t';
import { signOut } from '../lib/auth';
import { useAuth } from './AuthProvider';
import { AuthLoading } from './AuthLoading';

/** Guards the app screens: no session -> sign-in, no display name yet -> welcome. */
export function RequireAuth() {
  useLanguage();
  const { session, loading, profileFailed, displayName, retryProfile } = useAuth();

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/aanmelden" replace />;
  if (profileFailed) {
    // No navigation exists yet at this point, so the way out must be on this screen.
    return (
      <main className="page">
        <p role="alert">{t('auth.error')}</p>
        <button type="button" onClick={retryProfile}>
          {t('connection.retry')}
        </button>
        <button type="button" onClick={() => void signOut()}>
          {t('profile.signOut')}
        </button>
      </main>
    );
  }
  if (!displayName) return <Navigate to="/welkom" replace />;
  return <Outlet />;
}
