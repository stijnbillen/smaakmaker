import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { t, type TextKey } from '../i18n/t';
import {
  emptyIngredient,
  isDirty,
  MAX_INGREDIENTS,
  MAX_STEPS,
  moveItem,
  pruneDraft,
  removeItem,
  validateRecipe,
  type IngredientDraft,
  type RecipeDraft,
  type RecipeErrors,
} from '../lib/recipe';
import type { SaveResult } from '../lib/recipes';
import { ConfirmDialog } from './ConfirmDialog';
import { EquipmentPicker } from './EquipmentPicker';
import { useConnection } from './ConnectionProvider';

const KEY = 'recipe-form';

interface RecipeFormProps {
  heading: string;
  /** Starting values; "changed" means different from these. */
  initial: RecipeDraft;
  /** Writes the (valid, pruned) draft to the database. */
  submit: (draft: RecipeDraft) => Promise<SaveResult>;
  /** Called once saved; navigation must not be blocked by then. */
  onSaved: (id: string) => void;
  /** The "back" link. */
  backTo: string;
}

/** Validates the draft without its empty rows and maps the messages back onto the rows as shown. */
function check(draft: RecipeDraft): { ok: boolean; pruned: RecipeDraft; errors: RecipeErrors } {
  const { draft: pruned, ingredientIndex, stepIndex } = pruneDraft(draft);
  const result = validateRecipe(pruned);
  const errors: RecipeErrors = { ...result.errors, ingredientRows: {}, stepRows: {} };
  for (const [i, row] of Object.entries(result.errors.ingredientRows)) errors.ingredientRows[ingredientIndex[Number(i)]] = row;
  for (const [i, row] of Object.entries(result.errors.stepRows)) errors.stepRows[stepIndex[Number(i)]] = row;
  return { ok: result.ok, pruned, errors };
}

// Decorative icons (aria-hidden); the buttons carry their meaning in aria-label.
const icons = {
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  remove: <path d="M6 6l12 12M18 6L6 18" />,
};

interface RowButtonsProps {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function RowButtons({ label, index, count, onMove, onRemove }: RowButtonsProps) {
  const item = label;
  const fill = (key: TextKey) => t(key).replace('{item}', item);
  const button = (key: TextKey, icon: keyof typeof icons, disabled: boolean, onClick: () => void) => (
    <button type="button" className="icon-button" aria-label={fill(key)} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {icons[icon]}
      </svg>
    </button>
  );
  return (
    <div className="row-buttons">
      {button('form.moveUp', 'up', index === 0, () => onMove(-1))}
      {button('form.moveDown', 'down', index === count - 1, () => onMove(1))}
      {button('form.remove', 'remove', false, onRemove)}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="field-error">
      {children}
    </p>
  );
}

/** The one form for a new recipe and for editing. */
export function RecipeForm({ heading, initial, submit, onSaved, backTo }: RecipeFormProps) {
  const { report, resolve } = useConnection();
  const base = useId();
  const [draft, setDraft] = useState<RecipeDraft>(initial);
  const [attempted, setAttempted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Retry must save what is in the form now, not what was there at the first attempt.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const mounted = useRef(true);

  const dirty = useMemo(() => isDirty(initial, draft), [initial, draft]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // A left form must not stay registered as a retry action: retrying would write an abandoned recipe.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolve(KEY);
    };
  }, [resolve]);

  // Read at navigation time, so a save that just succeeded never asks to discard.
  const blocker = useBlocker(() => dirtyRef.current && !savedRef.current);

  // Reload and tab close: the browser shows its own text; we only have to ask.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const errors = useMemo(() => (attempted ? check(draft).errors : null), [attempted, draft]);

  // After a refused save the focus goes to the first field with a message.
  useEffect(() => {
    if (focusTick === 0) return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>('.list-add[data-needed]');
    target?.focus();
  }, [focusTick]);

  const save = useCallback(async () => {
    // Ignore double taps while a request is running.
    if (savingRef.current) return;
    const result = check(draftRef.current);
    if (!result.ok) {
      setAttempted(true);
      setFocusTick((n) => n + 1);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    const res = await submitRef.current(result.pruned);
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (res.error || !res.id) {
      setFailed(!report(KEY, res.error, res.status, () => void save()));
      return;
    }
    resolve(KEY);
    // First saved, then navigate: the blocker must let this one through.
    savedRef.current = true;
    onSavedRef.current(res.id);
  }, [report, resolve]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  const setTitle = (title: string) => setDraft((d) => ({ ...d, title }));
  const setIngredient = (i: number, patch: Partial<IngredientDraft>) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)) }));
  const setStep = (i: number, value: string) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? value : s)) }));

  const ids = (suffix: string) => `${base}-${suffix}`;
  const describedBy = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ') || undefined;
  const invalid = (flag: unknown) => (flag ? true : undefined);

  const titleError = errors?.title;
  const ingredientsError = errors?.ingredients;
  const stepsError = errors?.steps;

  return (
    <main className="page">
      <h1>{heading}</h1>
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor={ids('title')}>{t('form.titleLabel')}</label>
          <input
            id={ids('title')}
            type="text"
            value={draft.title}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={invalid(titleError)}
            aria-describedby={describedBy(titleError && ids('title-error'))}
          />
          {titleError && <FieldError id={ids('title-error')}>{t('form.titleInvalid')}</FieldError>}
        </div>

        <div className="field-pair">
          {(['prepMinutes', 'totalMinutes'] as const).map((name) => {
            const error = errors?.[name];
            const message =
              error === 'minutesRequired'
                ? t('form.minutesRequired')
                : error === 'minutesInvalid'
                  ? t('form.minutesInvalid')
                  : error === 'totalBeforePrep'
                    ? t('form.totalBeforePrep')
                    : null;
            return (
              <div className="field" key={name}>
                <label htmlFor={ids(name)}>{t(name === 'prepMinutes' ? 'form.prepMinutes' : 'form.totalMinutes')}</label>
                <input
                  id={ids(name)}
                  type="text"
                  inputMode="numeric"
                  value={draft[name]}
                  autoComplete="off"
                  onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))}
                  aria-invalid={invalid(error)}
                  aria-describedby={describedBy(error && ids(`${name}-error`))}
                />
                {message && <FieldError id={ids(`${name}-error`)}>{message}</FieldError>}
              </div>
            );
          })}
        </div>

        <div className="field">
          <label htmlFor={ids('servings')}>{t('form.servings')}</label>
          <input
            id={ids('servings')}
            type="text"
            inputMode="numeric"
            value={draft.servings}
            autoComplete="off"
            onChange={(e) => setDraft((d) => ({ ...d, servings: e.target.value }))}
            aria-invalid={invalid(errors?.servings)}
            aria-describedby={describedBy(errors?.servings && ids('servings-error'))}
          />
          {errors?.servings && (
            <FieldError id={ids('servings-error')}>
              {errors.servings === 'servingsRequired' ? t('form.servingsRequired') : t('form.servingsInvalid')}
            </FieldError>
          )}
        </div>

        <EquipmentPicker
          tooMany={Boolean(errors?.equipment)}
          selected={draft.equipment ?? []}
          onChange={(equipment) => setDraft((d) => ({ ...d, equipment }))} />

        <fieldset className="form-group">
          <legend>{t('form.ingredients')}</legend>
          {ingredientsError && (
            <FieldError id={ids('ingredients-error')}>
              {ingredientsError === 'ingredientsRequired' ? t('form.ingredientsRequired') : null}
            </FieldError>
          )}
          <ul className="row-list">
            {draft.ingredients.map((ing, i) => {
              const row = errors?.ingredientRows[i];
              const label = `${t('form.ingredientName')} ${i + 1}`;
              // The message about the whole list hangs on the first row's name field.
              const listError = i === 0 && ingredientsError === 'ingredientsRequired';
              return (
                <li key={i} className="row">
                  <div className="row-fields">
                    <div className="field row-name">
                      <label htmlFor={ids(`ing-${i}-name`)}>{label}</label>
                      <input
                        id={ids(`ing-${i}-name`)}
                        type="text"
                        value={ing.name}
                        autoComplete="off"
                        onChange={(e) => setIngredient(i, { name: e.target.value })}
                        aria-invalid={invalid(row?.name || listError)}
                        aria-describedby={describedBy(row?.name && ids(`ing-${i}-name-error`), listError && ids('ingredients-error'))}
                      />
                      {row?.name && <FieldError id={ids(`ing-${i}-name-error`)}>{t('form.nameInvalid')}</FieldError>}
                    </div>
                    <div className="field row-quantity">
                      <label htmlFor={ids(`ing-${i}-quantity`)}>{t('form.quantity')}</label>
                      <input
                        id={ids(`ing-${i}-quantity`)}
                        type="text"
                        inputMode="decimal"
                        value={ing.quantity}
                        autoComplete="off"
                        onChange={(e) => setIngredient(i, { quantity: e.target.value })}
                        aria-invalid={invalid(row?.quantity)}
                        aria-describedby={describedBy(row?.quantity && ids(`ing-${i}-quantity-error`))}
                      />
                      {row?.quantity && <FieldError id={ids(`ing-${i}-quantity-error`)}>{t('form.quantityInvalid')}</FieldError>}
                    </div>
                    <div className="field row-unit">
                      <label htmlFor={ids(`ing-${i}-unit`)}>{t('form.unit')}</label>
                      <input
                        id={ids(`ing-${i}-unit`)}
                        type="text"
                        value={ing.unit}
                        autoComplete="off"
                        onChange={(e) => setIngredient(i, { unit: e.target.value })}
                        aria-invalid={invalid(row?.unit)}
                        aria-describedby={describedBy(row?.unit && ids(`ing-${i}-unit-error`))}
                      />
                      {row?.unit && <FieldError id={ids(`ing-${i}-unit-error`)}>{t('form.unitInvalid')}</FieldError>}
                    </div>
                  </div>
                  <RowButtons
                    label={label}
                    index={i}
                    count={draft.ingredients.length}
                    onMove={(dir) => setDraft((d) => ({ ...d, ingredients: moveItem(d.ingredients, i, dir) }))}
                    onRemove={() => setDraft((d) => ({ ...d, ingredients: removeItem(d.ingredients, i) }))}
                  />
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="button-quiet list-add"
            data-needed={ingredientsError && draft.ingredients.length === 0 ? '' : undefined}
            disabled={draft.ingredients.length >= MAX_INGREDIENTS}
            onClick={() => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }))}
          >
            {t('form.addIngredient')}
          </button>
        </fieldset>

        <fieldset className="form-group">
          <legend>{t('form.steps')}</legend>
          {stepsError && (
            <FieldError id={ids('steps-error')}>{stepsError === 'stepsRequired' ? t('form.stepsRequired') : null}</FieldError>
          )}
          <ul className="row-list">
            {draft.steps.map((step, i) => {
              const rowError = errors?.stepRows[i];
              const label = t('form.step').replace('{n}', String(i + 1));
              const listError = i === 0 && stepsError === 'stepsRequired';
              return (
                <li key={i} className="row">
                  <div className="field row-step">
                    <label htmlFor={ids(`step-${i}`)}>{label}</label>
                    <textarea
                      id={ids(`step-${i}`)}
                      rows={3}
                      value={step}
                      onChange={(e) => setStep(i, e.target.value)}
                      aria-invalid={invalid(rowError || listError)}
                      aria-describedby={describedBy(rowError && ids(`step-${i}-error`), listError && ids('steps-error'))}
                    />
                    {rowError && <FieldError id={ids(`step-${i}-error`)}>{t('form.stepInvalid')}</FieldError>}
                  </div>
                  <RowButtons
                    label={label}
                    index={i}
                    count={draft.steps.length}
                    onMove={(dir) => setDraft((d) => ({ ...d, steps: moveItem(d.steps, i, dir) }))}
                    onRemove={() => setDraft((d) => ({ ...d, steps: removeItem(d.steps, i) }))}
                  />
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="button-quiet list-add"
            data-needed={stepsError && draft.steps.length === 0 ? '' : undefined}
            disabled={draft.steps.length >= MAX_STEPS}
            onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, ''] }))}
          >
            {t('form.addStep')}
          </button>
        </fieldset>

        {/* No maxlength: a too long paste must show the message instead of being cut off silently. */}
        <div className="field">
          <label htmlFor={ids('source')}>{t('form.source')}</label>
          <p id={ids('source-hint')} className="field-hint">
            {t('form.sourceHint')}
          </p>
          <input
            id={ids('source')}
            type="text"
            value={draft.source}
            autoComplete="off"
            onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
            aria-invalid={invalid(errors?.source)}
            aria-describedby={describedBy(ids('source-hint'), errors?.source && ids('source-error'))}
          />
          {errors?.source && <FieldError id={ids('source-error')}>{t('form.sourceTooLong')}</FieldError>}
        </div>

        <div className="field">
          <label htmlFor={ids('note')}>{t('form.note')}</label>
          <p id={ids('note-hint')} className="field-hint">
            {t('form.noteHint')}
          </p>
          <textarea
            id={ids('note')}
            rows={4}
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            aria-invalid={invalid(errors?.note)}
            aria-describedby={describedBy(ids('note-hint'), errors?.note && ids('note-error'))}
          />
          {errors?.note && <FieldError id={ids('note-error')}>{t('form.noteTooLong')}</FieldError>}
        </div>

        {failed && (
          <p role="alert" className="field-error">
            {t('form.error')}
          </p>
        )}
        <button type="submit" disabled={saving}>
          {t('form.save')}
        </button>
      </form>
      <Link to={backTo} className="button-link button-link--quiet">
        {t('form.back')}
      </Link>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          question={t('form.discardQuestion')}
          confirmLabel={t('form.discard')}
          cancelLabel={t('form.stay')}
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </main>
  );
}
