import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import {
  SEARCH_DEBOUNCE_MS,
  createDebouncer,
  parseTerms,
  toSearchParams,
  type IngredientSearch as SearchValue,
} from '../lib/ingredientSearch';

interface IngredientSearchProps {
  /** The search as the page holds it (from the URL). */
  value: SearchValue;
  onChange: (value: SearchValue) => void;
}

/** Comparable text of a search; "all" and a minimum of n give the same key. */
const keyOf = (search: SearchValue): string => toSearchParams(search).toString();

const joinTerms = (terms: string[]) => terms.join(', ');

/**
 * Ingredient search (R-009): "with" and "without" fields, "at least k" and a button. The typed text is local;
 * only the parsed terms go up, after a pause in typing or at once on submit. Reusable for the favourites list.
 */
export function IngredientSearch({ value, onChange }: IngredientSearchProps) {
  const [withText, setWithText] = useState(() => joinTerms(value.with));
  const [withoutText, setWithoutText] = useState(() => joinTerms(value.without));
  const withId = useId();
  const withoutId = useId();
  const minId = useId();
  const hintId = useId();
  const errorId = useId();

  // Latest props for the debouncer, which outlives a render.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  // Keys of what this component sent up. A value that matches is our own echo, not a change from outside.
  const lastEmitted = useRef(keyOf(value));
  const inFlight = useRef<string[]>([]);

  const emit = (withValue: string, withoutValue: string, min: number | null) => {
    const next: SearchValue = { with: parseTerms(withValue).terms, without: parseTerms(withoutValue).terms, min };
    const key = keyOf(next);
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    inFlight.current.push(key);
    latest.current.onChange(next);
  };

  const debouncer = useMemo(
    () => createDebouncer((texts: [string, string]) => emit(texts[0], texts[1], latest.current.value.min), SEARCH_DEBOUNCE_MS),
    // emit only reads refs, so one debouncer is enough.
    [],
  );
  useEffect(() => () => debouncer.cancel(), [debouncer]);

  // The URL changed by a link, back or forward: show its terms. While typing, value still equals what we sent.
  const valueKey = keyOf(value);
  useEffect(() => {
    if (valueKey === lastEmitted.current) {
      inFlight.current = [];
      return;
    }
    if (inFlight.current.includes(valueKey)) return;
    debouncer.cancel();
    inFlight.current = [];
    lastEmitted.current = valueKey;
    setWithText(joinTerms(latest.current.value.with));
    setWithoutText(joinTerms(latest.current.value.without));
  }, [valueKey, debouncer]);

  const typeWith = (text: string) => {
    setWithText(text);
    debouncer([text, withoutText]);
  };
  const typeWithout = (text: string) => {
    setWithoutText(text);
    debouncer([withText, text]);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    debouncer.cancel();
    emit(withText, withoutText, value.min);
  };
  const chooseMin = (k: number) => {
    debouncer.cancel();
    // Use the n the list was drawn with, so "all" stays "all" while a pause in typing is still running.
    emit(withText, withoutText, k < value.with.length ? k : null);
  };

  const tooMany = parseTerms(withText).tooMany || parseTerms(withoutText).tooMany;
  const n = value.with.length;
  const selected = value.min !== null && value.min < n ? value.min : n;

  return (
    <form className="ingredient-search" role="search" onSubmit={submit}>
      <div className="field">
        <label htmlFor={withId}>{t('search.with')}</label>
        <p className="field-hint" id={hintId}>
          {t('search.withHint')}
        </p>
        <input
          id={withId}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          value={withText}
          onChange={(e) => typeWith(e.target.value)}
          aria-describedby={tooMany ? `${hintId} ${errorId}` : hintId}
        />
      </div>
      <div className="field">
        <label htmlFor={withoutId}>{t('search.without')}</label>
        <input
          id={withoutId}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          value={withoutText}
          onChange={(e) => typeWithout(e.target.value)}
        />
      </div>
      {tooMany && (
        <p className="field-error" id={errorId}>
          {t('search.tooMany')}
        </p>
      )}
      {n >= 2 && (
        <div className="field">
          <label htmlFor={minId}>{t('search.min')}</label>
          <select id={minId} value={selected} onChange={(e) => chooseMin(Number(e.target.value))}>
            {Array.from({ length: n }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k === n ? t('search.minAll').replace('{n}', String(n)) : String(k)}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" className="button-quiet search-submit">
        {t('search.submit')}
      </button>
    </form>
  );
}
