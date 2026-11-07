import { useCallback, useEffect, useRef, useState } from 'react';
import { CatalogItemEditor } from '../components/CatalogItemEditor';
import { useConnection } from '../components/ConnectionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ListState } from '../components/ListState';
import { format, t, useLanguage } from '../i18n/t';
import { displayName } from '../lib/catalog';
import {
  deleteCatalogItem,
  listCatalog,
  mergeCatalogItems,
  type AdminCatalogRow,
} from '../lib/catalogAdmin';
import { mapCatalogError, type CatalogKind } from '../lib/catalogAdminLogic';
import { SEARCH_DEBOUNCE_MS } from '../lib/ingredientSearch';

const KEY = 'catalog-admin';
const KINDS: CatalogKind[] = ['ingredient', 'unit'];
// The full list (about 175 items) is fetched at once, but shown in steps: every row is a tab stop.
const PAGE_SIZE = 40;

interface Picked {
  id: string;
  name: string;
}

type Confirming = { action: 'merge' } | { action: 'delete'; row: AdminCatalogRow } | null;

/** Administrator's page for the ingredient and unit catalogues (R-022). */
export function CatalogAdminPage() {
  const lang = useLanguage();
  const { report, resolve } = useConnection();
  const [kind, setKind] = useState<CatalogKind>('ingredient');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<AdminCatalogRow[] | null>(null);
  const [errored, setErrored] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Merge mode: the list becomes the choice of the target item B; "from" is item A.
  const [from, setFrom] = useState<Picked | null>(null);
  const [into, setInto] = useState<Picked | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const busyRef = useRef(false);

  // Only the answer to the latest search counts; an empty term loads at once, a typed one after a pause.
  useEffect(() => {
    let current = true;
    const run = async () => {
      const { data, error, status } = await listCatalog(kind, term, lang);
      if (!current) return;
      if (error || !data) {
        setErrored(true);
        report(KEY, error, status, () => setReload((n) => n + 1));
        return;
      }
      resolve(KEY);
      setErrored(false);
      setRows(data);
    };
    const timer = setTimeout(() => void run(), term.trim() === '' ? 0 : SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, term, lang, reload, report, resolve]);

  useEffect(() => () => resolve(KEY), [resolve]);

  const nameOf = useCallback(
    (row: AdminCatalogRow) => displayName({ id: row.id, nameNl: row.nameNl, nameFr: row.nameFr }, lang),
    [lang],
  );

  function switchKind(next: CatalogKind) {
    if (next === kind) return;
    setKind(next);
    setTerm('');
    setLimit(PAGE_SIZE);
    setRows(null);
    setOpenId(null);
    setFrom(null);
    setInto(null);
    setMessage(null);
  }

  function leaveMerge() {
    setFrom(null);
    setInto(null);
    setConfirming(null);
  }

  async function confirmMerge() {
    if (!from || !into || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { error } = await mergeCatalogItems(kind, from.id, into.id);
    busyRef.current = false;
    setBusy(false);
    setConfirming(null);
    if (error) {
      const mapped = mapCatalogError(error);
      setMessage(t(mapped.kind === 'tooManySynonyms' ? 'catalogAdmin.error.mergeTooMany' : 'catalogAdmin.error.unknown'));
      return;
    }
    setMessage(null);
    setOpenId(null);
    leaveMerge();
    setReload((n) => n + 1);
  }

  async function confirmDelete(row: AdminCatalogRow) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { error } = await deleteCatalogItem(kind, row.id);
    busyRef.current = false;
    setBusy(false);
    setConfirming(null);
    if (error) {
      const mapped = mapCatalogError(error);
      setMessage(
        mapped.kind === 'inUse' ? format('catalogAdmin.inUse', { n: mapped.count }) : t('catalogAdmin.error.unknown'),
      );
      return;
    }
    setMessage(null);
    setOpenId(null);
    setReload((n) => n + 1);
  }

  const candidates = rows && from ? rows.filter((r) => r.id !== from.id) : rows;
  const shown = candidates ? candidates.slice(0, limit) : null;

  return (
    <main className="page">
      <h1>{t('catalogAdmin.title')}</h1>

      <div role="tablist" aria-label={t('catalogAdmin.title')} className="catalog-tabs">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`catalog-tab-${k}`}
            aria-selected={kind === k}
            aria-controls="catalog-panel"
            className="catalog-tab"
            onClick={() => switchKind(k)}
          >
            {t(k === 'ingredient' ? 'catalogAdmin.tab.ingredients' : 'catalogAdmin.tab.units')}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="catalog-panel" aria-labelledby={`catalog-tab-${kind}`}>
        <label htmlFor="catalog-search">{t('catalogAdmin.search')}</label>
        <input
          id="catalog-search"
          type="search"
          value={term}
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setLimit(PAGE_SIZE);
          }}
        />

        {from && (
          <div className="catalog-merge-bar">
            <p>{format('catalogAdmin.mergePick', { item: from.name })}</p>
            {into && (
              <button type="button" onClick={() => setConfirming({ action: 'merge' })}>
                {format('catalogAdmin.mergeInto', { item: into.name })}
              </button>
            )}
            <button type="button" className="button-quiet" onClick={leaveMerge}>
              {t('catalogAdmin.mergeStop')}
            </button>
          </div>
        )}

        {message && (
          <p role="alert" className="field-error">
            {message}
          </p>
        )}

        {!errored && (
          <ListState items={shown} loadingText={t('catalogAdmin.loading')} emptyText={t('catalogAdmin.empty')}>
            <ul className="catalog-list">
              {shown?.map((row) => {
                const open = openId === row.id && !from;
                return (
                  <li key={row.id} className="catalog-row">
                    <button
                      type="button"
                      className="catalog-row-main"
                      aria-expanded={from ? undefined : open}
                      onClick={() => {
                        if (from) {
                          setInto({ id: row.id, name: nameOf(row) });
                          setConfirming({ action: 'merge' });
                        } else {
                          setOpenId(open ? null : row.id);
                          setMessage(null);
                        }
                      }}
                    >
                      <span className="catalog-names">
                        {row.nameNl && <span>{row.nameNl}</span>}
                        {row.nameNl && row.nameFr && ' / '}
                        {row.nameFr && <span>{row.nameFr}</span>}
                      </span>
                      {row.synonyms.length > 0 && <span className="catalog-meta">{row.synonyms.join(', ')}</span>}
                      <span className="catalog-meta">
                        {row.useCount === 1
                          ? t('catalogAdmin.usesOne')
                          : format('catalogAdmin.uses', { n: row.useCount })}
                      </span>
                    </button>
                    {open && (
                      <CatalogItemEditor
                        key={`${row.id}-${row.nameNl}-${row.nameFr}-${row.synonyms.join('|')}`}
                        kind={kind}
                        row={row}
                        onSaved={() => {
                          setMessage(null);
                          setOpenId(null);
                          setReload((n) => n + 1);
                        }}
                        onMerge={() => {
                          setFrom({ id: row.id, name: nameOf(row) });
                          setInto(null);
                          setMessage(null);
                        }}
                        onDelete={() => setConfirming({ action: 'delete', row })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {candidates && candidates.length > limit && (
              <button type="button" className="button-quiet" onClick={() => setLimit(limit + PAGE_SIZE)}>
                {t('catalogAdmin.showMore')}
              </button>
            )}
          </ListState>
        )}
        {errored && <p role="alert">{t('catalogAdmin.error.unknown')}</p>}
      </div>

      {confirming?.action === 'merge' && from && into && (
        <ConfirmDialog
          question={format('catalogAdmin.mergeQuestion', { from: from.name, into: into.name })}
          confirmLabel={t('catalogAdmin.mergeConfirm')}
          cancelLabel={t('form.cancel')}
          busy={busy}
          onConfirm={() => void confirmMerge()}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.action === 'delete' && (
        <ConfirmDialog
          question={format('catalogAdmin.deleteQuestion', { item: nameOf(confirming.row) })}
          confirmLabel={t('catalogAdmin.delete')}
          cancelLabel={t('form.cancel')}
          busy={busy}
          onConfirm={() => void confirmDelete(confirming.row)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </main>
  );
}
