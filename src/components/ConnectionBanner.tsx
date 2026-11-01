import { t } from '../i18n/t';
import { useConnection } from './ConnectionProvider';

/** Shown above the page content; never replaces the route tree, so form state survives. */
export function ConnectionBanner() {
  const { failed, retryAll } = useConnection();
  if (!failed) return null;
  return (
    <div role="alert" className="connection-banner">
      <p>{t('connection.error')}</p>
      <button type="button" onClick={retryAll}>
        {t('connection.retry')}
      </button>
    </div>
  );
}
