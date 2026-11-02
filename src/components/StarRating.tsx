import { useId, type ReactNode } from 'react';
import { t } from '../i18n/t';

// One five-point star, drawn with currentColor so the colour comes from a token in the stylesheet.
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

function Star({ on }: { on: boolean }) {
  return (
    <svg className={on ? 'star star--on' : 'star'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={STAR_PATH} />
    </svg>
  );
}

export function starLabel(n: number): string {
  return n === 1 ? t('reviews.star').replace('{n}', '1') : t('reviews.stars').replace('{n}', String(n));
}

interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
  /** Id of the element with the error text; the group points to it for screen readers. */
  describedBy?: string;
  invalid?: boolean;
  children?: ReactNode;
}

/**
 * Input: real radio buttons, so the arrow keys and screen readers work as they do for any radio group.
 * `children` (the error message) renders inside the fieldset.
 */
export function StarRating({ value, onChange, describedBy, invalid, children }: StarRatingProps) {
  const name = useId();
  return (
    <fieldset className="form-group star-group" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <legend>{t('reviews.rating')}</legend>
      <div className="star-choices">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="star-choice">
            <input type="radio" name={name} checked={value === n} onChange={() => onChange(n)} />
            <Star on={value !== null && n <= value} />
            <span className="visually-hidden">{starLabel(n)}</span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

/** Display: decorative stars plus a text for screen readers ("4 van 5 sterren"). */
export function StarDisplay({ value }: { value: number }) {
  return (
    <span className="star-display">
      <span className="star-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} on={n <= value} />
        ))}
      </span>
      <span className="visually-hidden">{t('reviews.ratingOf').replace('{n}', String(value))}</span>
    </span>
  );
}
