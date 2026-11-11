import { useId, useState } from 'react';
import { format, t, useLanguage } from '../i18n/t';
import { getLanguage } from '../i18n/language';
import { fetchItemName, updateCatalogItem, type AdminCatalogRow } from '../lib/catalogAdmin';
import { mapCatalogError, validateCatalogItem, type CatalogKind, type CatalogValidation } from '../lib/catalogAdminLogic';
import { itemKey } from '../lib/catalog';
import { parseFactor, type UnitMeasure } from '../lib/unitMeasure';

const VALIDATION_TEXT = {
  noName: 'catalogAdmin.error.noName',
  nameTooLong: 'catalogAdmin.error.nameTooLong',
  synonymTooLong: 'catalogAdmin.error.synonymTooLong',
  tooManySynonyms: 'catalogAdmin.error.tooManySynonyms',
  duplicateKey: 'catalogAdmin.error.duplicateKey',
  invalidFactor: 'catalogAdmin.error.factor',
} as const satisfies Record<CatalogValidation, string>;

interface CatalogItemEditorProps {
  kind: CatalogKind;
  row: AdminCatalogRow;
  /** Called after the item was saved. */
  onSaved: () => void;
  onMerge: () => void;
  onDelete: () => void;
}

/** Edit panel of one catalogue item: both names, synonyms as chips, save, merge and delete. */
export function CatalogItemEditor({ kind, row, onSaved, onMerge, onDelete }: CatalogItemEditorProps) {
  useLanguage();
  const ids = useId();
  const [nameNl, setNameNl] = useState(row.nameNl ?? '');
  const [nameFr, setNameFr] = useState(row.nameFr ?? '');
  const [synonyms, setSynonyms] = useState(row.synonyms);
  const [measure, setMeasure] = useState<UnitMeasure>(row.measure ?? 'none');
  const [factorText, setFactorText] = useState(row.factor === null ? '' : String(row.factor));
  const [factorInvalid, setFactorInvalid] = useState(false);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addSynonym() {
    const value = draft.trim();
    if (value === '') return;
    // The same key twice inside one item makes no sense; the field stays as it is so the user sees why.
    if (synonyms.some((s) => itemKey(s) === itemKey(value))) {
      setMessage(t('catalogAdmin.error.duplicateKey'));
      return;
    }
    setSynonyms([...synonyms, value]);
    setDraft('');
    setMessage(null);
  }

  async function save() {
    if (busy) return;
    const withFactor = kind === 'unit' && measure !== 'none';
    const factor = withFactor ? parseFactor(factorText) : null;
    const input = {
      nameNl: nameNl.trim() || null,
      nameFr: nameFr.trim() || null,
      synonyms,
      ...(kind === 'unit' ? { measure, factor } : {}),
    };
    const problem = validateCatalogItem(kind, input);
    setFactorInvalid(problem === 'invalidFactor');
    if (problem) {
      setMessage(t(VALIDATION_TEXT[problem]));
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await updateCatalogItem(
      kind,
      row.id,
      input.nameNl,
      input.nameFr,
      synonyms,
      kind === 'unit' ? { measure, factor } : undefined,
    );
    if (!error) {
      setBusy(false);
      onSaved();
      return;
    }
    const mapped = mapCatalogError(error);
    if (mapped.kind === 'exists') {
      const other = await fetchItemName(kind, mapped.itemId, getLanguage());
      // The other item may be gone by now: do not show "Bestaat al bij ." with an empty name.
      setMessage(other === '' ? t('catalogAdmin.error.unknown') : format('catalogAdmin.exists', { item: other }));
    } else if (mapped.kind === 'invalid') {
      setMessage(t('catalogAdmin.error.invalid'));
    } else if (mapped.kind === 'forbidden') {
      setMessage(t('catalogAdmin.error.forbidden'));
    } else {
      setMessage(t('catalogAdmin.error.unknown'));
    }
    setBusy(false);
  }

  return (
    <div className="catalog-editor">
      <label htmlFor={`${ids}-nl`}>{t('catalogAdmin.nameNl')}</label>
      <input id={`${ids}-nl`} type="text" value={nameNl} onChange={(e) => setNameNl(e.target.value)} />
      <label htmlFor={`${ids}-fr`}>{t('catalogAdmin.nameFr')}</label>
      <input id={`${ids}-fr`} type="text" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />

      <p className="catalog-editor-label">{t('catalogAdmin.synonyms')}</p>
      {synonyms.length > 0 && (
        <ul className="catalog-chips">
          {synonyms.map((s) => (
            <li key={s}>
              <span>{s}</span>
              <button
                type="button"
                className="catalog-chip-remove"
                aria-label={format('catalogAdmin.removeSynonym', { synonym: s })}
                onClick={() => setSynonyms(synonyms.filter((x) => x !== s))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={`${ids}-syn`}>{t('catalogAdmin.newSynonym')}</label>
      <div className="catalog-add">
        <input
          id={`${ids}-syn`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSynonym();
            }
          }}
        />
        <button type="button" className="button-quiet" onClick={addSynonym}>
          {t('catalogAdmin.addSynonym')}
        </button>
      </div>

      {kind === 'unit' && (
        <>
          <p className="catalog-editor-label" id={`${ids}-measure`}>
            {t('catalogAdmin.measure')}
          </p>
          <div className="choice-list" role="group" aria-labelledby={`${ids}-measure`}>
            {(['volume', 'weight', 'none'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="choice"
                aria-pressed={measure === m}
                onClick={() => {
                  setMeasure(m);
                  setFactorInvalid(false);
                }}
              >
                {t(m === 'volume' ? 'catalogAdmin.measureVolume' : m === 'weight' ? 'catalogAdmin.measureWeight' : 'catalogAdmin.measureNone')}
              </button>
            ))}
          </div>
          {measure !== 'none' && (
            <>
              <label htmlFor={`${ids}-factor`}>{t('catalogAdmin.factor')}</label>
              <input
                id={`${ids}-factor`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={factorText}
                onChange={(e) => {
                  setFactorText(e.target.value);
                  setFactorInvalid(false);
                }}
                aria-invalid={factorInvalid ? true : undefined}
                aria-describedby={factorInvalid ? `${ids}-factor-error` : undefined}
              />
            </>
          )}
        </>
      )}

      {message && (
        <p role="alert" id={factorInvalid ? `${ids}-factor-error` : undefined} className="field-error">
          {message}
        </p>
      )}

      <div className="catalog-actions">
        <button type="button" onClick={() => void save()} disabled={busy}>
          {t('form.save')}
        </button>
        <button type="button" className="button-quiet" onClick={onMerge}>
          {t('catalogAdmin.merge')}
        </button>
        <button type="button" className="button-quiet" onClick={onDelete}>
          {t('catalogAdmin.delete')}
        </button>
      </div>
    </div>
  );
}
