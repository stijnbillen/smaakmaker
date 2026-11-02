import { useNavigate } from 'react-router-dom';
import { RecipeForm } from '../components/RecipeForm';
import { t } from '../i18n/t';
import { emptyDraft } from '../lib/recipe';
import { createRecipe } from '../lib/recipes';

const INITIAL = emptyDraft();

export function NewRecipePage() {
  const navigate = useNavigate();
  return (
    <RecipeForm
      heading={t('form.title')}
      initial={INITIAL}
      submit={createRecipe}
      // replace: the back button must not return to a form that was saved.
      onSaved={(id) => navigate(`/recept/${id}`, { replace: true })}
      backTo="/"
    />
  );
}
