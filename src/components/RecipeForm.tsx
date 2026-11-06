import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { t, useLanguage } from '../i18n/t';
import {
  emptyIngredient,
  INGREDIENT_NAME_MAX,
  INGREDIENT_SIZES,
  isDirty,
  MAX_INGREDIENTS,
  UNIT_MAX,
  type IngredientSize,
  MAX_STEPS,
  moveItem,
  pruneDraft,
  removeItem,
  validateRecipe,
  type IngredientDraft,
  type RecipeDraft,
  type RecipeErrors,
} from '../lib/recipe';
import type { SaveResult, SizeProblem } from '../lib/recipes';
import { checkRecipeSize, formatRecipeSize, PHOTO_MAX_BYTES, recipeSizeBytes, recipeTextBytes, RECIPE_MAX_BYTES } from '../lib/recipeSize';
import { CatalogField, type FieldHandle } from './CatalogField';
import { ConfirmDialog } from './ConfirmDialog';
import { EquipmentPicker } from './EquipmentPicker';
import { PhotoPicker } from './PhotoPicker';
import { RowButtons } from './RowButtons';
import { TagPicker } from './TagPicker';
import { useConnection } from './ConnectionProvider';

const KEY = 'recipe-form';

const SIZE_CHOICE = { small: 'form.sizeSmall', medium: 'form.sizeMedium', large: 'form.sizeLarge' } as const;

let lineCounter = 0;
/** A stable id per ingredient row, so an open question or a late answer stays with its own row. */
const newUid = (): string => `line-${++lineCounter}`;
const newLine = (): IngredientDraft => ({ ...emptyIngredient(), uid: newUid() });
const withUids = (draft: RecipeDraft): RecipeDraft => ({
  ...draft,
  ingredients: draft.ingredients.map((ing) => (ing.uid ? ing : { ...ing, uid: newUid() })),
});

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
  /**
   * Stored file sizes (path -> bytes) of the recipe being edited. Null while they are still loading or when
   * the lookup failed; the counter then shows "…" and the database stays the real limit.
   */
  photoSizes?: ReadonlyMap<string, number> | null;
}

/** Sizes of the photos in the draft; `unknown` when a stored photo's size is not known (yet). */
function photoBytesOf(draft: RecipeDraft, sizes: ReadonlyMap<string, number> | null | undefined): { bytes: number[]; unknown: boolean } {
  const bytes: number[] = [];
  let unknown = false;
  for (const photo of draft.photos ?? []) {
    let size = photo.bytes ?? (photo.path ? sizes?.get(photo.path) : undefined);
    // Lookup done but this path is not in it (missing file, or folder listing cut off): the database
    // counts that as the bucket maximum, so do the same.
    if (size === undefined && photo.path && sizes) size = PHOTO_MAX_BYTES;
    if (size === undefined) unknown = true;
    else bytes.push(size);
  }
  return { bytes, unknown };
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

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="field-error">
      {children}
    </p>
  );
}

/** The one form for a new recipe and for editing. */
export function RecipeForm({ heading, initial, submit, onSaved, backTo, photoSizes }: RecipeFormProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const base = useId();
  const [draft, setDraft] = useState<RecipeDraft>(() => withUids(initial));
  // Open questions of the catalogue fields ("uid:name" / "uid:unit"), and the handles to check them.
  const [asking, setAsking] = useState<ReadonlySet<string>>(new Set());
  const [answerFirst, setAnswerFirst] = useState(false);
  const [focusAsk, setFocusAsk] = useState<{ key: string; n: number } | null>(null);
  const fields = useRef(new Map<string, FieldHandle>());
  const [attempted, setAttempted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Which part is too large, from the client check or from the database's refusal (R-004).
  const [sizeProblem, setSizeProblem] = useState<SizeProblem | null>(null);
  // The source of a variant was deleted while this form was open.
  const [sourceGone, setSourceGone] = useState(false);
  // A photo that is still being converted is not in the draft yet; saving now would lose it.
  const [photoBusy, setPhotoBusy] = useState(false);
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
  const photoSizesRef = useRef(photoSizes);
  photoSizesRef.current = photoSizes;

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
    setAnswerFirst(false);
    // A changed name or unit that was not checked yet (the user tapped "Opslaan" straight away) is checked first.
    const unchecked = [...fields.current.values()].filter((h) => h.status() === 'unsettled');
    if (unchecked.length > 0) {
      savingRef.current = true;
      await Promise.all(unchecked.map((h) => h.check()));
      savingRef.current = false;
      if (!mounted.current) return;
    }
    // A question is still open: the answer decides whether the line points to an item, so it comes first.
    const open = draftRef.current.ingredients
      .flatMap((ing) => [`${ing.uid}:name`, `${ing.uid}:unit`])
      .find((key) => fields.current.get(key)?.status() === 'asking');
    if (open) {
      setAnswerFirst(true);
      setFocusAsk((prev) => ({ key: open, n: (prev?.n ?? 0) + 1 }));
      return;
    }
    const result = check(draftRef.current);
    if (!result.ok) {
      setAttempted(true);
      setFocusTick((n) => n + 1);
      return;
    }
    // Convenience only (no pointless upload, a quick message): the database makes the real decision.
    const known = photoBytesOf(result.pruned, photoSizesRef.current);
    const verdict = checkRecipeSize(recipeTextBytes(result.pruned), known.bytes);
    if (verdict !== 'ok') {
      setFailed(false);
      setSizeProblem(verdict === 'textTooLarge' ? 'text' : 'photos');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    setSizeProblem(null);
    setSourceGone(false);
    const res = await submitRef.current(result.pruned);
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (res.sourceGone) {
      // An answer from the database: no banner, the form stays filled in.
      setSourceGone(true);
      return;
    }
    if (res.sizeProblem) {
      // An answer from the database, not a connection problem: no banner, the form stays as it is.
      setSizeProblem(res.sizeProblem);
      return;
    }
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
  // By row id, not index: an answer that arrives late must land on its own row even after a move or removal.
  const patchLine = (uid: string | undefined, patch: Partial<IngredientDraft> | ((current: IngredientDraft) => Partial<IngredientDraft>)) => {
    const apply = (d: RecipeDraft): RecipeDraft => ({
      ...d,
      ingredients: d.ingredients.map((ing) =>
        ing.uid === uid ? { ...ing, ...(typeof patch === 'function' ? patch(ing) : patch) } : ing,
      ),
    });
    // Also in the ref at once: "Opslaan" waits for a check and must then read the result, not the last render.
    draftRef.current = apply(draftRef.current);
    setDraft(apply);
  };
  const onAsking = useCallback((key: string, isAsking: boolean) => {
    setAsking((prev) => {
      const next = new Set(prev);
      if (isAsking) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => {
    if (asking.size === 0) setAnswerFirst(false);
  }, [asking]);
  // After a refused save the focus goes to the open question (rendered by now).
  useEffect(() => {
    if (focusAsk) fields.current.get(focusAsk.key)?.focusQuestion();
  }, [focusAsk]);
  const setStep = (i: number, value: string) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? value : s)) }));

  const ids = (suffix: string) => `${base}-${suffix}`;
  const describedBy = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ') || undefined;
  const invalid = (flag: unknown) => (flag ? true : undefined);

  const photoSize = photoBytesOf(draft, photoSizes);
  const usedBytes = recipeSizeBytes(recipeTextBytes(draft), photoSize.bytes);
  const sizeOver = usedBytes > RECIPE_MAX_BYTES;

  // A shown size message must not contradict the counter once the user has brought the recipe under the limit.
  // Only while the sizes are all known; the database's own refusal stays until the next save otherwise.
  useEffect(() => {
    if (!photoSize.unknown && usedBytes <= RECIPE_MAX_BYTES) setSizeProblem(null);
  }, [photoSize.unknown, usedBytes]);

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

        <PhotoPicker
          photos={draft.photos ?? []}
          onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
          onBusyChange={setPhotoBusy}
        />

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

        <TagPicker
          kind="dish"
          label={t('tags.dish')}
          hint={t('form.dishTagsHint')}
          errorId="dish-tags-error"
          tooMany={Boolean(errors?.dishTags)}
          selected={draft.dishTags ?? []}
          onChange={(dishTags) => setDraft((d) => ({ ...d, dishTags }))}
        />

        <TagPicker
          kind="trait"
          label={t('tags.trait')}
          hint={t('form.traitTagsHint')}
          errorId="trait-tags-error"
          tooMany={Boolean(errors?.traitTags)}
          selected={draft.traitTags ?? []}
          onChange={(traitTags) => setDraft((d) => ({ ...d, traitTags }))}
        />

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
                <li key={ing.uid ?? i} className="row">
                  <div className="row-fields">
                    <CatalogField
                      kind="ingredient"
                      fieldKey={`${ing.uid}:name`}
                      id={ids(`ing-${i}-name`)}
                      label={label}
                      className="row-name"
                      value={ing.name}
                      max={INGREDIENT_NAME_MAX}
                      registry={fields}
                      onAsking={onAsking}
                      onChange={(v) => patchLine(ing.uid, (cur) => ({ name: v.text, ingredient: v.item, freeText: { ...cur.freeText, name: v.free } }))}
                      invalid={Boolean(row?.name || listError)}
                      describedBy={describedBy(row?.name && ids(`ing-${i}-name-error`), listError && ids('ingredients-error'))}
                    >
                      {row?.name && <FieldError id={ids(`ing-${i}-name-error`)}>{t('form.nameInvalid')}</FieldError>}
                    </CatalogField>
                    {answerFirst && asking.has(`${ing.uid}:name`) && <FieldError id={ids(`ing-${i}-answer`)}>{t('form.answerFirst')}</FieldError>}
                    <div className="field row-quantity">
                      <label htmlFor={ids(`ing-${i}-quantity`)}>{t('form.quantity')}</label>
                      <input
                        id={ids(`ing-${i}-quantity`)}
                        type="text"
                        inputMode="decimal"
                        value={ing.quantity}
                        autoComplete="off"
                        onChange={(e) => patchLine(ing.uid, { quantity: e.target.value })}
                        aria-invalid={invalid(row?.quantity)}
                        aria-describedby={describedBy(row?.quantity && ids(`ing-${i}-quantity-error`))}
                      />
                      {row?.quantity && <FieldError id={ids(`ing-${i}-quantity-error`)}>{t('form.quantityInvalid')}</FieldError>}
                    </div>
                    <CatalogField
                      kind="unit"
                      fieldKey={`${ing.uid}:unit`}
                      id={ids(`ing-${i}-unit`)}
                      label={t('form.unit')}
                      className="row-unit"
                      value={ing.unit}
                      max={UNIT_MAX}
                      registry={fields}
                      onAsking={onAsking}
                      onChange={(v) => patchLine(ing.uid, (cur) => ({ unit: v.text, unitItem: v.item, freeText: { ...cur.freeText, unit: v.free } }))}
                      invalid={Boolean(row?.unit)}
                      describedBy={describedBy(row?.unit && ids(`ing-${i}-unit-error`))}
                    >
                      {row?.unit && <FieldError id={ids(`ing-${i}-unit-error`)}>{t('form.unitInvalid')}</FieldError>}
                    </CatalogField>
                    {answerFirst && asking.has(`${ing.uid}:unit`) && <FieldError id={ids(`ing-${i}-unit-answer`)}>{t('form.answerFirst')}</FieldError>}
                    <div className="field row-size">
                      <label htmlFor={ids(`ing-${i}-size`)}>{t('form.size')}</label>
                      <select
                        id={ids(`ing-${i}-size`)}
                        value={ing.size ?? ''}
                        onChange={(e) => patchLine(ing.uid, { size: (e.target.value || undefined) as IngredientSize | undefined })}
                      >
                        <option value="">{t('form.sizeNone')}</option>
                        {INGREDIENT_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {t(SIZE_CHOICE[size])}
                          </option>
                        ))}
                      </select>
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
            onClick={() => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, newLine()] }))}
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
        {sourceGone && (
          <p role="alert" className="field-error">
            {t('variant.sourceGone')}
          </p>
        )}
        {sizeProblem && (
          <p role="alert" id="size-error" className="field-error">
            {sizeProblem === 'text' ? t('size.textTooLarge') : t('size.photosTooLarge')}
          </p>
        )}
        {/* Not a live region: a screen reader must not read it out at every keystroke. */}
        <p data-testid="recipe-size" className={sizeOver ? 'recipe-size recipe-size--over' : 'recipe-size'}>
          {photoSize.unknown ? t('size.loading') : formatRecipeSize(usedBytes)}
        </p>
        <button type="submit" disabled={saving || photoBusy}>
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
