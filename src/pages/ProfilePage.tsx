import { useAuth } from '../components/AuthProvider';
import { t } from '../i18n/t';
import { signOut } from '../lib/auth';

export function ProfilePage() {
  const { displayName } = useAuth();
  return (
    <main className="page">
      <h1>{t('profile.title')}</h1>
      <p className="profile-name">{displayName}</p>
      {/* The auth state change then sends the user to the sign-in screen. */}
      <button type="button" onClick={() => void signOut()}>
        {t('profile.signOut')}
      </button>
    </main>
  );
}
