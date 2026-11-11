import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { displayName, type CatalogItem } from '../lib/catalog';
import { MAX_OPTIONS, optionLabel, optionNames, resolveOnLeave, shouldFetch, type PendingQuestion } from '../lib/ingredientPicker';
import { addCatalogItem, fetchCatalogItems, fetchSuggestions } from '../lib/recipes';
import { createSuggestionLoader, type SuggestKind, type Suggestion } from '../lib/suggest';
import { format, t, useLanguage } from '../i18n/t';
import { googleSearchUrl, parseFactor, type UnitMeasure } from '../lib/unitMeasure';
import { useConnection } from './ConnectionProvider';

/** Second step of a new unit (R-033): "How many ml (or g) is 1 <unit>?" with a message at the field. */
function FactorStep({
  label,
  saving,
  link,
  onBack,
  onSave,
}: {
  label: string;
  saving: boolean;
  link: ReactNode;
  onBack: () => void;
  onSave: (factor: number) => void;
}) {
  const ids = useId();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const errorId = `${ids}-error`;

  function submit() {
    const factor = parseFactor(text);
    if (factor === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(factor);
  }

  return (
    <>
      <label htmlFor={`${ids}-factor`} className="catalog-question-text">
        {label}
      </label>
      <input
        id={`${ids}-factor`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          // The recipe form around us is a form: Enter must not save the whole recipe.
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
      />
      {invalid && (
        <p id={errorId} className="field-error">
          {t('form.factorInvalid')}
        </p>
      )}
      <div className="catalog-question-buttons">
        <button type="button" disabled={saving} onClick={submit}>
          {t('form.save')}
        </button>
        <button type="button" className="button-quiet" onClick={onBack}>
          {t('form.factorBack')}
        </button>
        {link}
      </div>
    </>
  );
}

/** What the form needs from a field to decide about "Opslaan". */
export interface FieldHandle {
  /** `unsettled`: the text changed and has not been checked yet; `asking`: a question is open. */
  status: () => 'settled' | 'unsettled' | 'asking';
  /** Checks a changed text now (the same check as when leaving the field). */
  check: () => Promise<void>;
  focusQuestion: () => void;
}

export interface FieldValue {
  text: string;
  /** The linked item; absent for free text. */
  item?: CatalogItem;
  /** The user chose to keep the text as free text. */
  free?: boolean;
}

interface CatalogFieldProps {
  kind: SuggestKind;
  /** Unique per row and field; names the field in the form's registry and in connection reports. */
  fieldKey: string;
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (value: FieldValue) => void;
  registry: MutableRefObject<Map<string, FieldHandle>>;
  /** Tells the form that a question opened or closed, so it can render again. */
  onAsking: (fieldKey: string, asking: boolean) => void;
  className: string;
  invalid?: boolean;
  describedBy?: string;
  /** Shown inside the field, below the input: the field's own validation message. */
  children?: ReactNode;
}

/**
 * The name or unit field of an ingredient line (R-020): suggestions from the catalogue while typing, a
 * check when the field is left after a change, and an inline question when the text is not an item yet.
 * The text lives in the form's draft; what is settled and what is asked lives here, per row.
 */
export function CatalogField({
  kind,
  fieldKey,
  id,
  label,
  value,
  max,
  onChange,
  registry,
  onAsking,
  className,
  invalid,
  describedBy,
  children,
}: CatalogFieldProps) {
  const lang = useLanguage();
  const { report, resolve } = useConnection();
  const listId = useId();
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [question, setQuestionState] = useState<PendingQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  // Refs hold what async answers must compare against: the text now, not the text at the time of the call.
  const textRef = useRef(value);
  textRef.current = value;
  const langRef = useRef(lang);
  langRef.current = lang;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAskingRef = useRef(onAsking);
  onAskingRef.current = onAsking;
  const unsettled = useRef(false);
  const questionRef = useRef<PendingQuestion | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const seq = useRef(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reportKey = `catalog-${fieldKey}`;

  const setQuestion = useCallback(
    (next: PendingQuestion | null) => {
      const wasAsking = questionRef.current !== null;
      questionRef.current = next;
      setQuestionState(next);
      if (wasAsking !== (next !== null)) onAskingRef.current(fieldKey, next !== null);
    },
    [fieldKey],
  );

  const loader = useMemo(
    () =>
      createSuggestionLoader({
        fetch: async (term) => {
          const res = await fetchSuggestions(kind, term, 'autocomplete', langRef.current);
          if (res.error) {
            report(`${reportKey}-suggest`, res.error, res.status, () => undefined);
            // The loader keeps the previous suggestions after a failed call.
            throw res.error;
          }
          resolve(`${reportKey}-suggest`);
          return res.rows;
        },
        onResult: (found) => setRows(found.slice(0, MAX_OPTIONS)),
      }),
    [kind, report, resolve, reportKey],
  );

  const link = useCallback(
    (item: CatalogItem) => {
      seq.current += 1;
      unsettled.current = false;
      setQuestion(null);
      setRows([]);
      loader.cancel();
      onChangeRef.current({ text: displayName(item, langRef.current), item });
    },
    [loader, setQuestion],
  );

  const check = useCallback((): Promise<void> => {
    // A running check may be about older text; once it is done, look again at what is left to check.
    if (inFlight.current) return inFlight.current.then(() => check());
    if (!unsettled.current) return Promise.resolve();
    const text = textRef.current;
    const mine = ++seq.current;
    loader.cancel();
    setRows([]);
    const run = async () => {
      const trimmed = text.trim();
      let found: Suggestion[] = [];
      // Empty or too long: no call. resolveOnLeave decides ('none' or 'invalid') without rows.
      if (trimmed !== '' && [...trimmed].length <= max) {
        const res = await fetchSuggestions(kind, trimmed, 'didYouMean', langRef.current);
        if (res.error) {
          // The field stays free text, still to be checked; the banner offers a retry.
          report(reportKey, res.error, res.status, () => void check());
          return;
        }
        resolve(reportKey);
        found = res.rows;
      }
      // A late answer: the user typed on, linked another way or removed the row meanwhile.
      if (mine !== seq.current || textRef.current !== text) return;
      const result = resolveOnLeave(text, found, max);
      unsettled.current = false;
      if (result.action === 'link') link(result.item);
      else if (result.action === 'didYouMean') setQuestion({ kind: 'didYouMean', text, options: result.options });
      else if (result.action === 'askNew') setQuestion({ kind: 'askNew', text });
    };
    const promise = run()
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = promise;
    return promise;
  }, [kind, loader, max, link, report, resolve, reportKey, setQuestion]);

  useEffect(() => {
    registry.current.set(fieldKey, {
      status: () => (questionRef.current ? 'asking' : unsettled.current ? 'unsettled' : 'settled'),
      check,
      focusQuestion: () => groupRef.current?.querySelector<HTMLElement>('button')?.focus(),
    });
    const map = registry.current;
    return () => {
      map.delete(fieldKey);
    };
  }, [registry, fieldKey, check]);

  useEffect(
    () => () => {
      loader.cancel();
      seq.current += 1;
      resolve(reportKey);
      resolve(`${reportKey}-suggest`);
      if (questionRef.current) onAskingRef.current(fieldKey, false);
    },
    [loader, resolve, reportKey, fieldKey],
  );

  function onType(text: string) {
    unsettled.current = true;
    seq.current += 1;
    setQuestion(null);
    onChange({ text });
    if (shouldFetch(text)) loader.update(text);
    else {
      loader.update('');
      setRows([]);
    }
  }

  async function createItem(q: PendingQuestion, measure?: { measure: UnitMeasure; factor: number | null }) {
    if (saving) return;
    setSaving(true);
    const text = q.text.trim();
    const res = await addCatalogItem(kind, text, langRef.current, measure);
    setSaving(false);
    if (res.error || !res.id) {
      report(`${reportKey}-add`, res.error, res.status, () => undefined);
      return;
    }
    resolve(`${reportKey}-add`);
    let item: CatalogItem =
      langRef.current === 'nl' ? { id: res.id, nameNl: text, nameFr: null } : { id: res.id, nameNl: null, nameFr: text };
    // Someone else added it first: show the names it really has.
    if (!res.created) {
      const found = await fetchCatalogItems(kind === 'ingredient' ? [res.id] : [], kind === 'unit' ? [res.id] : []);
      item = found.items.get(res.id) ?? item;
    }
    // The item exists now whatever happens; only link when the field still holds this text.
    if (textRef.current !== q.text) return;
    link(item);
  }

  function keepFree(q: PendingQuestion) {
    seq.current += 1;
    unsettled.current = false;
    setQuestion(null);
    onChange({ text: q.text, free: true });
  }

  const showList = focused && rows.length > 0 && !question;
  // A tap on an option or a button must not blur the field first: the blur check would overwrite the choice.
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

  const questionText = !question
    ? ''
    : question.kind === 'didYouMean'
      ? format('form.didYouMean', { name: optionNames(question.options, lang) })
      : question.kind === 'askMeasure'
        ? format('form.measureQuestion', { name: question.text.trim() })
        : question.kind === 'askFactor'
          ? format(question.measure === 'volume' ? 'form.factorQuestionVolume' : 'form.factorQuestionWeight', {
              name: question.text.trim(),
            })
          : format(kind === 'ingredient' ? 'form.newIngredientQuestion' : 'form.newUnitQuestion', { name: question.text.trim() });
  const googleLink = (q: { text: string }, base: 'ml' | 'g') => (
    // A plain link: the unit name only goes to Google when the user taps it.
    <a
      className="catalog-question-link"
      href={googleSearchUrl(q.text, base, lang)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('form.googleLink')}
    </a>
  );

  return (
    <>
      <div className={`field ${className}`}>
        <label htmlFor={id}>{label}</label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          autoComplete="off"
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            void check();
          }}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label={t('form.suggestions')} className="suggestion-list">
            {rows.map((row) => (
              <li
                key={`${row.id}-${row.matched}`}
                role="option"
                aria-selected={false}
                className="suggestion-option"
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={() => link({ id: row.id, nameNl: row.nameNl, nameFr: row.nameFr })}
              >
                {optionLabel(row, lang, value)}
              </li>
            ))}
          </ul>
        )}
        {!showList && <span id={listId} hidden />}
        {children}
      </div>
      {question?.kind === 'askFactor' && (
        <div ref={groupRef} role="group" aria-label={questionText} className="catalog-question">
          <FactorStep
            key={question.measure}
            label={questionText}
            saving={saving}
            link={googleLink(question, question.measure === 'volume' ? 'ml' : 'g')}
            onBack={() => setQuestion({ kind: 'askMeasure', text: question.text })}
            onSave={(factor) => void createItem(question, { measure: question.measure, factor })}
          />
        </div>
      )}
      {question && question.kind !== 'askFactor' && (
        <div ref={groupRef} role="group" aria-label={questionText} className="catalog-question">
          <p className="catalog-question-text">{questionText}</p>
          <div className="catalog-question-buttons">
            {question.kind === 'askMeasure' ? (
              <>
                <button type="button" disabled={saving} onClick={() => setQuestion({ kind: 'askFactor', text: question.text, measure: 'volume' })}>
                  {t('form.measureVolume')}
                </button>
                <button type="button" disabled={saving} onClick={() => setQuestion({ kind: 'askFactor', text: question.text, measure: 'weight' })}>
                  {t('form.measureWeight')}
                </button>
                <button type="button" disabled={saving} onClick={() => void createItem(question, { measure: 'none', factor: null })}>
                  {t('form.measureNone')}
                </button>
                <button type="button" disabled={saving} onClick={() => void createItem(question, { measure: 'none', factor: null })}>
                  {t('form.measureUnknown')}
                </button>
                {googleLink(question, 'ml')}
              </>
            ) : question.kind === 'didYouMean' ? (
              <>
                {question.options.map((o) => (
                  <button key={o.id} type="button" className="button-quiet" onClick={() => link(o)}>
                    {displayName(o, lang)}
                  </button>
                ))}
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() => setQuestion({ kind: 'askNew', text: question.text })}
                >
                  {format('form.notThis', { input: question.text.trim() })}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => (kind === 'unit' ? setQuestion({ kind: 'askMeasure', text: question.text }) : void createItem(question))}
                >
                  {t('form.yes')}
                </button>
                <button type="button" className="button-quiet" onClick={() => keepFree(question)}>
                  {t('form.no')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
