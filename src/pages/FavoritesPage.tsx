import { ListState } from '../components/ListState';
import { t } from '../i18n/t';

// No favourites table yet: T-017 fetches them and passes null while loading.
export function FavoritesPage() {
  return (
    <main className="page">
      <h1>{t('favorites.title')}</h1>
      <ListState items={[]} loadingText={t('favorites.loading')} emptyText={t('favorites.empty')}>
        {null}
      </ListState>
    </main>
  );
}
