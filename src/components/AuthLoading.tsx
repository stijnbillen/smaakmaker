import { t } from '../i18n/t';
import { ConnectionBanner } from './ConnectionBanner';

/** Loading state shared by the guarded screens and /welkom. */
export function AuthLoading() {
  // The banner must also show while the profile load fails, before AppLayout exists.
  return (
    <>
      <ConnectionBanner />
      <p role="status" className="list-state list-state--loading page">
        <span className="spinner" aria-hidden="true" />
        {t('auth.loading')}
      </p>
    </>
  );
}
