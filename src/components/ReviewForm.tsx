import { useId, useRef, useState, type FormEvent } from 'react';
import { t, type TextKey, useLanguage } from '../i18n/t';
import { validateReview, type ReviewDraft } from '../lib/reviews';
import { StarRating } from './StarRating';

interface ReviewFormProps {
  initial?: ReviewDraft;
  /** Resolves when the call is finished; the form stays mounted so a failed save keeps the input. */
  onSubmit: (draft: ReviewDraft) => Promise<void>;
  /** Only when editing. */
  onCancel?: () => void;
  /** Section-level message for a failed save. */
  error?: TextKey | null;
}

export function ReviewForm({ initial, onSubmit, onCancel, error }: ReviewFormProps) {
  useLanguage();
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [body, setBody] = useState(initial?.body ?? '');
  // Errors show after the first try to save, and then follow the input live.
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const ratingErrorId = useId();
  const bodyErrorId = useId();
  const bodyId = useId();
  const countId = useId();

  const errors = submitted ? validateReview({ rating, body }) : {};

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // A double tap while the call runs must not send twice.
    if (savingRef.current) return;
    setSubmitted(true);
    if (Object.keys(validateReview({ rating, body })).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({ rating, body });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="review-form" onSubmit={(e) => void submit(e)} noValidate>
      <StarRating
        value={rating}
        onChange={setRating}
        invalid={errors.rating !== undefined}
        describedBy={errors.rating ? ratingErrorId : undefined}
      >
        {errors.rating && (
          <p id={ratingErrorId} className="field-error">
            {t('reviews.errorRating')}
          </p>
        )}
      </StarRating>
      <div className="field">
        <label htmlFor={bodyId}>{t('reviews.body')}</label>
        <textarea
          id={bodyId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body !== undefined || undefined}
          aria-describedby={errors.body ? `${countId} ${bodyErrorId}` : countId}
        />
        <p id={countId} className="field-hint">
          {t('reviews.bodyCount').replace('{n}', String([...body].length))}
        </p>
        {errors.body && (
          <p id={bodyErrorId} className="field-error">
            {t('reviews.errorBody')}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}
      <div className="review-actions">
        <button type="submit" disabled={saving}>
          {t('reviews.save')}
        </button>
        {onCancel && (
          <button type="button" className="button-quiet" onClick={onCancel}>
            {t('form.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
