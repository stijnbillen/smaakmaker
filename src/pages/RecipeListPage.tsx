import { RecipeBrowser } from '../components/RecipeBrowser';
import { t } from '../i18n/t';

export function RecipeListPage() {
  return (
    <RecipeBrowser
      title={t('overview.title')}
      loadingText={t('overview.loading')}
      emptyText={t('overview.empty')}
      connectionKey="recipe-list"
    />
  );
}
