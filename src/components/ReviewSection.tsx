import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { canDeleteReview, canEditReview } from '../lib/permissions';
import { formatRating, reviewCountText, type Review, type ReviewDraft } from '../lib/reviews';
import {
  createReview,
  deleteReview,
  fetchRatingSummary,
  fetchReviews,
  updateReview,
  type RatingSummary,
} from '../lib/reviewsApi';
import { AuthorLine } from './AuthorLine';
import { useAuth } from './AuthProvider';
import { useConnection } from './ConnectionProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { ListState } from './ListState';
import { ReviewForm } from './ReviewForm';
import { StarDisplay } from './StarRating';

const LOAD_KEY = 'review-load';
const SAVE_KEY = 'review-save';
const DELETE_KEY = 'review-delete';

export function ReviewSection({ recipeId }: { recipeId: string }) {
  const { session, isAdmin } = useAuth();
  const { report, resolve } = useConnection();
  const userId = session?.user.id ?? null;

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const active = useRef(true);
  // Numbers the loads: a late answer must not overwrite a newer list.
  const requestId = useRef(0);
  const deletingRef = useRef(false);

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    const [list, sum] = await Promise.all([fetchReviews(recipeId), fetchRatingSummary(recipeId)]);
    if (!active.current || mine !== requestId.current) return;
    const error = list.error ?? sum.error;
    if (error) {
      const status = list.error ? list.status : sum.status;
      setLoadFailed(!report(LOAD_KEY, error, status, () => void load()));
      return;
    }
    resolve(LOAD_KEY);
    setLoadFailed(false);
    setReviews(list.reviews);
    setSummary(sum.summary);
  }, [recipeId, report, resolve]);

  useEffect(() => {
    active.current = true;
    setReviews(null);
    setSummary(null);
    void load();
    return () => {
      active.current = false;
      // A left page must not stay registered as a retry action.
      resolve(LOAD_KEY);
      resolve(SAVE_KEY);
      resolve(DELETE_KEY);
    };
  }, [load, resolve]);

  // `target` is the review being edited, or null for a new one. The retry closure keeps the same draft.
  const save = useCallback(
    async (draft: ReviewDraft, target: string | null): Promise<void> => {
      setSaveError(null);
      setNotice(null);
      const res = target === null ? await createReview(recipeId, draft) : await updateReview(target, draft);
      if (!active.current) return;
      if ('duplicate' in res && res.duplicate) {
        // Created elsewhere (second tab): show what exists so the user can edit it.
        resolve(SAVE_KEY);
        setNotice(t('reviews.duplicate'));
        await load();
        return;
      }
      if (res.error) {
        // A connection error gets the banner and keeps the input; other errors show their own message.
        if (!report(SAVE_KEY, res.error, res.status, () => void save(draft, target))) setSaveError(t('reviews.saveFailed'));
        return;
      }
      resolve(SAVE_KEY);
      setEditingId(null);
      await load();
    },
    [recipeId, report, resolve, load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (deletingRef.current) return;
      deletingRef.current = true;
      setDeleting(true);
      setNotice(null);
      const { error, status } = await deleteReview(id);
      deletingRef.current = false;
      if (!active.current) return;
      setDeleting(false);
      if (error) {
        // 0 rows counts as failed too (row-level security refuses silently).
        if (!report(DELETE_KEY, error, status, () => void remove(id))) setNotice(t('reviews.deleteFailed'));
        return;
      }
      resolve(DELETE_KEY);
      await load();
    },
    [report, resolve, load],
  );

  const own = reviews?.find((r) => r.authorId === userId) ?? null;
  // The form shows once the list is known and only when the user has no review yet.
  const showForm = reviews !== null && userId !== null && own === null;

  return (
    <section className="recipe-section review-section">
      <h2>{t('reviews.title')}</h2>
      {summary && (
        <p className="rating-summary" data-testid="rating-summary">
          {summary.avg === null
            ? t('reviews.none')
            : t('reviews.summary').replace('{avg}', formatRating(summary.avg)).replace('{count}', reviewCountText(summary.count))}
        </p>
      )}
      {loadFailed && <p>{t('reviews.loadFailed')}</p>}
      {notice && (
        <p role="alert" className="field-error">
          {notice}
        </p>
      )}

      {showForm && (
        <div className="review-new">
          <h3>{t('reviews.write')}</h3>
          <ReviewForm onSubmit={(draft) => save(draft, null)} error={saveError} />
        </div>
      )}

      {!loadFailed && (
        <ListState items={reviews} loadingText={t('reviews.loading')} emptyText="">
          <ul className="review-list">
            {reviews?.map((r) => {
              const viewer = { userId, isAdmin };
              const editing = editingId === r.id;
              return (
                <li key={r.id} className="review-item" data-testid="review-item">
                  {editing ? (
                    <ReviewForm
                      initial={{ rating: r.rating, body: r.body ?? '' }}
                      onSubmit={(draft) => save(draft, r.id)}
                      onCancel={() => {
                        setEditingId(null);
                        setSaveError(null);
                      }}
                      error={saveError}
                    />
                  ) : (
                    <>
                      <StarDisplay value={r.rating} />
                      {r.body && <p className="review-body">{r.body}</p>}
                      <AuthorLine name={r.authorName} date={r.createdAt} />
                      {(canEditReview(r, viewer) || canDeleteReview(r, viewer)) && (
                        <div className="review-actions">
                          {canEditReview(r, viewer) && (
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => {
                                setSaveError(null);
                                setEditingId(r.id);
                              }}
                            >
                              {t('reviews.edit')}
                            </button>
                          )}
                          {canDeleteReview(r, viewer) && (
                            <button type="button" className="button-quiet" disabled={deleting} onClick={() => setConfirmingId(r.id)}>
                              {t('reviews.delete')}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </ListState>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          question={t('reviews.deleteQuestion')}
          confirmLabel={t('reviews.delete')}
          cancelLabel={t('form.cancel')}
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => {
            const id = confirmingId;
            setConfirmingId(null);
            void remove(id);
          }}
        />
      )}
    </section>
  );
}
