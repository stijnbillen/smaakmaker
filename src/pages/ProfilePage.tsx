import { t } from '../i18n/t';

// Display name and sign-out come with T-003.
export function ProfilePage() {
  return (
    <main className="page">
      <h1>{t('profile.title')}</h1>
    </main>
  );
}
