import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthorLine } from '../components/AuthorLine';
import { useAuth } from '../components/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useConnection } from '../components/ConnectionProvider';
import { t } from '../i18n/t';
import { canDelete, canEdit } from '../lib/permissions';
import { formatQuantity } from '../lib/recipe';
import { deleteRecipe } from '../lib/recipes';
import { useRecipe } from '../lib/useRecipe';

const DELETE_KEY = 'recipe-delete';

export function RecipeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, isAdmin } = useAuth();
  const { report, resolve } = useConnection();
  const state = useRecipe(id, 'recipe-detail');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deletingRef = useRef(false);
  const mounted = useRef(true);

  // A left page must not stay registered as a retry action: retrying would delete behind the user's back.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolve(DELETE_KEY);
    };
  }, [resolve]);

  const remove = useCallback(async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteFailed(false);
    const { error, status } = await deleteRecipe(id);
    deletingRef.current = false;
    if (!mounted.current) return;
    setDeleting(false);
    if (error) {
      // 0 rows counts as failed too (row-level security refuses silently).
      setDeleteFailed(!report(DELETE_KEY, error, status, () => void remove()));
      return;
    }
    resolve(DELETE_KEY);
    navigate('/', { replace: true });
  }, [id, report, resolve, navigate]);

  if (state.status === 'loading') {
    return (
      <main className="page">
        <p role="status" className="list-state list-state--loading">
          <span className="spinner" aria-hidden="true" />
          {t('recipe.loading')}
        </p>
      </main>
    );
  }
  if (state.status !== 'ready') {
    return (
      <main className="page">
        <p>{state.status === 'notFound' ? t('recipe.notFound') : t('recipe.loadFailed')}</p>
        <Link to="/" className="button-link button-link--quiet">
          {t('recipe.backToList')}
        </Link>
      </main>
    );
  }

  const { recipe } = state;
  const item = { authorId: recipe.authorId };
  const userId = session?.user.id ?? null;
  // Buttons are convenience; the row-level rules in the database decide.
  const mayEdit = canEdit(item, { userId });
  const mayDelete = canDelete(item, { userId, isAdmin });

  return (
    <main className="page">
      <h1>{recipe.title}</h1>
      <AuthorLine name={recipe.authorName} date={recipe.createdAt} />

      {recipe.ingredients.length > 0 && (
        <section className="recipe-section">
          <h2>{t('recipe.ingredients')}</h2>
          <ul className="ingredient-list">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {[ing.quantity === undefined ? '' : formatQuantity(ing.quantity), ing.unit ?? '', ing.name]
                  .filter(Boolean)
                  .join(' ')}
              </li>
            ))}
          </ul>
        </section>
      )}
      {recipe.steps.length > 0 && (
        <section className="recipe-section">
          <h2>{t('recipe.steps')}</h2>
          <ol className="step-list">
            {recipe.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {deleteFailed && (
        <p role="alert" className="field-error">
          {t('recipe.deleteFailed')}
        </p>
      )}
      {(mayEdit || mayDelete) && (
        <div className="recipe-actions">
          {mayEdit && (
            <Link to={`/recept/${recipe.id}/bewerken`} className="button-link">
              {t('recipe.edit')}
            </Link>
          )}
          {mayDelete && (
            <button type="button" className="button-quiet" disabled={deleting} onClick={() => setConfirming(true)}>
              {t('recipe.delete')}
            </button>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          question={t('recipe.deleteQuestion')}
          confirmLabel={t('recipe.deleteConfirm')}
          cancelLabel={t('form.cancel')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void remove();
          }}
        />
      )}
    </main>
  );
}
