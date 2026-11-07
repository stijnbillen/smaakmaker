import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecipeForm } from '../components/RecipeForm';
import { t, useLanguage } from '../i18n/t';
import { emptyDraft } from '../lib/recipe';
import { createRecipe, newSaveSession } from '../lib/recipes';

const INITIAL = emptyDraft();

export function NewRecipePage() {
  useLanguage();
  const navigate = useNavigate();
  // One recipe id and one set of uploaded files per form, so "try again" reuses what is already uploaded.
  const session = useRef(newSaveSession());
  return (
    <RecipeForm
      heading={t('form.title')}
      initial={INITIAL}
      submit={(draft) => createRecipe(draft, session.current)}
      // replace: the back button must not return to a form that was saved.
      onSaved={(id) => navigate(`/recept/${id}`, { replace: true })}
      backTo="/"
    />
  );
}
