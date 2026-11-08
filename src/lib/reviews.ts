// Pure review logic (R-012). No import of the Supabase client, so unit tests can load it.
import { locale } from '../i18n/language';
import { format, t } from '../i18n/t';

export const MAX_REVIEW_LENGTH = 500;

export interface ReviewDraft {
  rating: number | null;
  body: string;
}

export interface Review {
  id: string;
  authorId: string;
  authorName: string | null;
  rating: number;
  body: string | null;
  createdAt: string;
}

export interface ReviewErrors {
  rating?: 'required' | 'range';
  body?: 'tooLong';
}

export function validateReview(draft: ReviewDraft): ReviewErrors {
  const errors: ReviewErrors = {};
  if (draft.rating === null) errors.rating = 'required';
  else if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) errors.rating = 'range';
  // Trim first and count code points, like the database (char_length after the trim trigger).
  if ([...draft.body.trim()].length > MAX_REVIEW_LENGTH) errors.body = 'tooLong';
  return errors;
}

const ratingFormats = new Map<string, Intl.NumberFormat>();

/** Always one decimal, separator of the language: "4,3" / "4.3", "4,0" / "4.0". */
export function formatRating(n: number): string {
  const loc = locale();
  let f = ratingFormats.get(loc);
  if (!f) {
    f = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    ratingFormats.set(loc, f);
  }
  return f.format(n);
}

/** "1 review" / "3 reviews". */
export function reviewCountText(n: number): string {
  return n === 1 ? t('reviews.countOne') : format('reviews.countMany', { n });
}
