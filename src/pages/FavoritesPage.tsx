import { RecipeBrowser } from '../components/RecipeBrowser';
import { t } from '../i18n/t';

// Same list, search and filters as the overview, restricted to the signed-in user's favourites.
export function FavoritesPage() {
  return (
    <RecipeBrowser
      favoritesOnly
      title={t('favorites.title')}
      loadingText={t('favorites.loading')}
      emptyText={t('favorites.empty')}
      connectionKey="favorites-list"
    />
  );
}
