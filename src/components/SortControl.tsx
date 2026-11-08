import { useId } from 'react';
import { t, useLanguage, type TextKey } from '../i18n/t';
import { changeField, type RecipeSort, type SortField } from '../lib/recipeSort';

interface SortControlProps {
  value: RecipeSort;
  onChange: (value: RecipeSort) => void;
}

/** In the order of the list. */
const FIELDS: Array<{ field: SortField; label: TextKey }> = [
  { field: 'created', label: 'overview.sortCreated' },
  { field: 'rating', label: 'overview.sortRating' },
  { field: 'title', label: 'overview.sortTitle' },
  { field: 'total', label: 'overview.sortTotal' },
  { field: 'prep', label: 'overview.sortPrep' },
];

/** The sort field list and the direction button. The list's label is hidden: the options speak for themselves. */
export function SortControl({ value, onChange }: SortControlProps) {
  useLanguage();
  const id = useId();
  const next = value.direction === 'asc' ? 'desc' : 'asc';
  return (
    <div className="sort-control">
      <label htmlFor={id} className="visually-hidden">
        {t('overview.sort')}
      </label>
      <select id={id} value={value.field} onChange={(e) => onChange(changeField(value, e.target.value as SortField))}>
        {FIELDS.map(({ field, label }) => (
          <option key={field} value={field}>
            {t(label)}
          </option>
        ))}
      </select>
      {/* The name is the current direction; the arrow only shows it. */}
      <button
        type="button"
        className="button-quiet sort-direction"
        onClick={() => onChange({ field: value.field, direction: next })}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className={`sort-arrow sort-arrow--${value.direction}`}>
          <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="visually-hidden">{t(value.direction === 'asc' ? 'overview.sortAsc' : 'overview.sortDesc')}</span>
      </button>
    </div>
  );
}
