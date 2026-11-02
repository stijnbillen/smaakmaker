import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthorLine } from '../components/AuthorLine';
import { useAuth } from '../components/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ServingsStepper } from '../components/ServingsStepper';
import { useConnection } from '../components/ConnectionProvider';
import { t } from '../i18n/t';
import { canDelete, canEdit } from '../lib/permissions';
import { formatDuration } from '../lib/format';
import { ingredientLine, sourceLink } from '../lib/recipe';
import { deleteRecipe } from '../lib/recipes';
import { useRecipe } from '../lib/useRecipe';

const DELETE_KEY = 'recipe-delete';

export function RecipeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, isAdmin } = useAuth();
  const { report, resolve } = useConnection();
  const state = useRecipe(id, 'recipe-detail');
  const [chosenState, setChosenState] = useState<{ id: string; value: number } | null>(null);
  const chosen = chosenState;
  const setChosen = (value: number) => setChosenState({ id: state.status === 'ready' ? state.recipe.id : id, value });
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
  // Temporary choice, tied to the recipe id: another recipe or a reload starts at its stored servings.
  const link = sourceLink(recipe.source);
  const stored = recipe.servings;
  const desired = stored !== null && chosen?.id === recipe.id ? chosen.value : (stored ?? 1);

  return (
    <main className="page">
      <h1>{recipe.title}</h1>
      <AuthorLine name={recipe.authorName} date={recipe.createdAt} />
      {recipe.prepMinutes !== null && recipe.totalMinutes !== null && (
        <dl className="recipe-times-list">
          <div>
            <dt>{t('time.prep')}</dt>
            <dd>{formatDuration(recipe.prepMinutes)}</dd>
          </div>
          <div>
            <dt>{t('time.total')}</dt>
            <dd>{formatDuration(recipe.totalMinutes)}</dd>
          </div>
        </dl>
      )}
      {recipe.source && (
        <dl className="recipe-source">
          <dt>{t('recipe.source')}</dt>
          <dd data-testid="recipe-source">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                {link}
                <span className="visually-hidden"> ({t('recipe.sourceNewTab')})</span>
              </a>
            ) : (
              recipe.source
            )}
          </dd>
        </dl>
      )}

      {recipe.dishTags.length > 0 && (
        <section className="recipe-section">
          <h2>{t('tags.dish')}</h2>
          <ul className="equipment-tags" data-testid="recipe-dish-tags">
            {recipe.dishTags.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}

      {recipe.traitTags.length > 0 && (
        <section className="recipe-section">
          <h2>{t('tags.trait')}</h2>
          <ul className="equipment-tags" data-testid="recipe-trait-tags">
            {recipe.traitTags.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}

      {recipe.equipment.length > 0 && (
        <section className="recipe-section">
          <h2>{t('recipe.equipment')}</h2>
          <ul className="equipment-tags" data-testid="recipe-equipment">
            {recipe.equipment.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}

      {recipe.ingredients.length > 0 && (
        <section className="recipe-section">
          <h2>{t('recipe.ingredients')}</h2>
          {stored !== null && <ServingsStepper value={desired} onChange={setChosen} />}
          {stored !== null && desired !== stored && (
            <p className="servings-note">{t('servings.original').replace('{n}', String(stored))}</p>
          )}
          <ul className="ingredient-list">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{stored === null ? ingredientLine(ing, 1, 1) : ingredientLine(ing, stored, desired)}</li>
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
      {recipe.note && (
        <section className="recipe-section">
          <h2>{t('recipe.note')}</h2>
          {/* Plain text only: React escapes it, line breaks come from CSS. */}
          <p className="recipe-note" data-testid="recipe-note">
            {recipe.note}
          </p>
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
