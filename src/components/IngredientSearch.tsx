import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { format, t, useLanguage } from '../i18n/t';
import {
  SEARCH_DEBOUNCE_MS,
  createDebouncer,
  dedupeByItem,
  parseTerms,
  replaceTerm,
  toSearchParams,
  type TermInfo,
  type IngredientSearch as SearchValue,
} from '../lib/ingredientSearch';
import { fetchTermInfo } from '../lib/recipes';

/**
 * Term information (exact item, "did you mean") for one field. Fetched after a pause in typing and again on a
 * language change; only the answer to the latest request counts. A failed call changes nothing: the search itself
 * does not depend on it, and the list shows real connection trouble.
 */
function useTermInfo(text: string, lang: 'nl' | 'fr'): TermInfo[] {
  const [info, setInfo] = useState<TermInfo[]>([]);
  const termsKey = JSON.stringify(parseTerms(text).terms);
  useEffect(() => {
    const terms = JSON.parse(termsKey) as string[];
    if (terms.length === 0) {
      setInfo([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      fetchTermInfo(terms, lang)
        .then((res) => {
          if (current && !res.error) setInfo(res.info);
        })
        .catch(() => {
          // Leave the previous answer; see above.
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [termsKey, lang]);
  return info;
}

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
  const lang = useLanguage();
  const [withText, setWithText] = useState(() => joinTerms(value.with));
  const [withoutText, setWithoutText] = useState(() => joinTerms(value.without));
  const withInfo = useTermInfo(withText, lang);
  const withoutInfo = useTermInfo(withoutText, lang);
  // Read by emit, which outlives a render.
  const infoRef = useRef({ with: withInfo, without: withoutInfo });
  infoRef.current = { with: withInfo, without: withoutInfo };
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
    // Two terms for one item count as one (R-021); without info yet, terms are kept as typed.
    const next: SearchValue = {
      with: dedupeByItem(parseTerms(withValue).terms, infoRef.current.with).terms,
      without: dedupeByItem(parseTerms(withoutValue).terms, infoRef.current.without).terms,
      min,
    };
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

  // Duplicates: send the merged terms up as soon as the answer is in, so n and the URL are right.
  const withTerms = parseTerms(withText).terms;
  const withoutTerms = parseTerms(withoutText).terms;
  const duplicates = [
    ...dedupeByItem(withTerms, withInfo).duplicates,
    ...dedupeByItem(withoutTerms, withoutInfo).duplicates,
  ];
  const infoKey = JSON.stringify([withInfo, withoutInfo]);
  useEffect(() => {
    if (duplicates.length > 0) emit(withText, withoutText, latest.current.value.min);
    // Only a new answer matters; typing goes through the debouncer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoKey]);

  // One "did you mean" per term that is still in the field, so an answer for older input never shows.
  const suggestionsFor = (terms: string[], info: TermInfo[]) =>
    terms.flatMap((term) => {
      const found = info.find((i) => i.term === term);
      return found?.suggestion && found.itemId === null ? [{ term, name: found.suggestion.name }] : [];
    });
  const suggestionButtons = (field: 'with' | 'without', items: Array<{ term: string; name: string }>) =>
    items.map(({ term, name }) => (
      <button
        key={`${field}-${term}`}
        type="button"
        className="button-quiet search-suggestion"
        onClick={() => applySuggestion(field, term, name)}
      >
        {format('search.didYouMean', { name })}
      </button>
    ));
  const applySuggestion = (field: 'with' | 'without', term: string, name: string) => {
    debouncer.cancel();
    if (field === 'with') {
      const text = replaceTerm(withText, term, name);
      setWithText(text);
      emit(text, withoutText, value.min);
    } else {
      const text = replaceTerm(withoutText, term, name);
      setWithoutText(text);
      emit(withText, text, value.min);
    }
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
        {suggestionButtons('with', suggestionsFor(withTerms, withInfo))}
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
        {suggestionButtons('without', suggestionsFor(withoutTerms, withoutInfo))}
      </div>
      {duplicates.length > 0 && <p className="field-hint search-duplicate">{t('search.duplicate')}</p>}
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
