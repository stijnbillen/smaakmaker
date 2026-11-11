import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { format, t, useLanguage } from '../i18n/t';
import {
  addCustomItem,
  fetchCustomItems,
  fetchMarks,
  fetchShoppingSource,
  pruneMarks,
  removeCustomItem,
  setCustomBought,
  setMark,
  type ShoppingSource,
} from '../lib/shoppingApi';
import {
  arrangeList,
  buildShoppingList,
  parseCustomItem,
  shoppingText,
  type ArrangedLine,
  type CustomItem,
  type MarkState,
} from '../lib/shoppingList';
import { useConnection } from './ConnectionProvider';

const LOAD_KEY = 'shopping-load';
const ADD_KEY = 'shopping-add';
const ERROR_ID = 'shopping-custom-error';

/** The shopping tab (R-032): the list is computed from the menu; marks and own items come from the database. */
export function ShoppingList() {
  const lang = useLanguage();
  const { report, resolve } = useConnection();
  const [source, setSource] = useState<ShoppingSource | null>(null);
  const [marks, setMarks] = useState<Map<string, MarkState>>(new Map());
  const [items, setItems] = useState<CustomItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<'invalid' | 'full' | null>(null);
  const [copy, setCopy] = useState<{ state: 'copied' | 'failed'; text: string } | null>(null);
  const active = useRef(true);
  // The latest wish per mark key: only the last tap counts when answers arrive out of order.
  const wished = useRef(new Map<string, MarkState | null>());
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const load = useCallback(async () => {
    const [src, mk, it] = await Promise.all([fetchShoppingSource(), fetchMarks(), fetchCustomItems()]);
    if (!active.current) return;
    const error = src.error ?? mk.error ?? it.error;
    if (error) {
      const res = [src, mk, it].find((r) => r.error)!;
      setFailed(!report(LOAD_KEY, error, res.status, () => void load()));
      return;
    }
    resolve(LOAD_KEY);
    setFailed(false);
    const data = { sources: src.sources!, catalog: src.catalog!, units: src.units! };
    wished.current.clear();
    setSource(data);
    setItems(it.items);
    // Prune only now, after a complete load: a failed load must never wipe the marks. Keys do not depend on the language.
    const keys = buildShoppingList(data.sources, data.catalog, data.units, 'nl').map((l) => l.key);
    const known = new Set(keys);
    const live = new Map([...mk.marks].filter(([k]) => known.has(k)));
    setMarks(live);
    if (live.size < mk.marks.size) void pruneMarks(keys);
  }, [report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(LOAD_KEY);
      resolve(ADD_KEY);
    };
  }, [load, resolve]);

  // The sums depend on the menu and the language only; a tap on a mark does not rebuild them.
  const lines = useMemo(
    () => (source ? buildShoppingList(source.sources, source.catalog, source.units, lang) : []),
    [source, lang],
  );
  const arranged = useMemo(() => arrangeList(lines, items, marks, lang), [lines, items, marks, lang]);

  const changeMark = useCallback(
    async (key: string, state: MarkState | null) => {
      const reportKey = `shopping-mark-${key}`;
      const before = marksRef.current.get(key) ?? null;
      wished.current.set(key, state);
      setMarks((m) => {
        const next = new Map(m);
        if (state) next.set(key, state);
        else next.delete(key);
        return next;
      });
      const { error, status } = await setMark(key, state);
      if (!active.current || wished.current.get(key) !== state) return;
      wished.current.delete(key);
      if (error) {
        // Back to what the database has; a lost connection offers a retry of the same wish.
        setMarks((m) => {
          const next = new Map(m);
          if (before) next.set(key, before);
          else next.delete(key);
          return next;
        });
        setFailed(!report(reportKey, error, status, () => void changeMark(key, state)));
        return;
      }
      resolve(reportKey);
      setFailed(false);
    },
    [report, resolve],
  );

  const toggleBought = (line: ArrangedLine) => {
    if (line.itemId) {
      void changeItemBought(line.itemId, !items.find((i) => i.id === line.itemId)?.bought);
      return;
    }
    void changeMark(line.key, marks.get(line.key) === 'bought' ? null : 'bought');
  };

  const changeItemBought = useCallback(
    async (id: string, bought: boolean) => {
      const reportKey = `shopping-item-${id}`;
      const patch = (value: boolean) => setItems((list) => list.map((i) => (i.id === id ? { ...i, bought: value } : i)));
      patch(bought);
      const { error, status } = await setCustomBought(id, bought);
      if (!active.current) return;
      if (error) {
        patch(!bought);
        setFailed(!report(reportKey, error, status, () => void changeItemBought(id, bought)));
        return;
      }
      resolve(reportKey);
      setFailed(false);
    },
    [report, resolve],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const reportKey = `shopping-remove-${id}`;
      const { error, status } = await removeCustomItem(id);
      if (!active.current) return;
      if (error) {
        setFailed(!report(reportKey, error, status, () => void removeItem(id)));
        return;
      }
      resolve(reportKey);
      setFailed(false);
      setItems((list) => list.filter((i) => i.id !== id));
    },
    [report, resolve],
  );

  const add = useCallback(
    async (text: string) => {
      const { item, error, status, full } = await addCustomItem(text);
      if (!active.current) return;
      if (full) {
        setFieldError('full');
        return;
      }
      if (error) {
        setFailed(!report(ADD_KEY, error, status, () => void add(text)));
        return;
      }
      resolve(ADD_KEY);
      setFailed(false);
      setFieldError(null);
      setDraft('');
      if (item) setItems((list) => [...list, item]);
    },
    [report, resolve],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseCustomItem(draft);
    if (!parsed.ok) {
      setFieldError('invalid');
      return;
    }
    setFieldError(null);
    void add(parsed.value);
  };

  const copyList = async () => {
    const text = shoppingText(arranged.toBuy);
    try {
      await navigator.clipboard.writeText(text);
      setCopy({ state: 'copied', text });
    } catch {
      // Blocked or unsupported (some iOS versions): show the text so it can be copied by hand.
      setCopy({ state: 'failed', text });
    }
  };

  useEffect(() => {
    if (copy?.state !== 'copied') return;
    const timer = setTimeout(() => setCopy(null), 3000);
    return () => clearTimeout(timer);
  }, [copy]);

  if (!source) {
    return (
      <section className="recipe-section">
        <h2>{t('shopping.title')}</h2>
        {failed ? <p role="alert" className="field-error">{t('shopping.error')}</p> : <p className="field-hint">{t('shopping.loading')}</p>}
      </section>
    );
  }
  // An empty menu shows no list at all (own items stay stored and come back with the next dish).
  if (source.sources.length === 0) return null;

  const row = (line: ArrangedLine) => {
    const pressed = line.itemId ? !!items.find((i) => i.id === line.itemId)?.bought : marks.get(line.key) === 'bought';
    return (
      <li key={line.key} className="shopping-row">
        <button type="button" className="shopping-line" aria-pressed={pressed} onClick={() => toggleBought(line)}>
          {line.text}
        </button>
        {line.itemId ? (
          <button
            type="button"
            className="button-quiet shopping-side"
            aria-label={t('shopping.removeLabel').replace('{text}', line.text)}
            onClick={() => void removeItem(line.itemId!)}
          >
            {t('shopping.remove')}
          </button>
        ) : (
          <button type="button" className="button-quiet shopping-side" onClick={() => void changeMark(line.key, 'have')}>
            {t('shopping.have')}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="recipe-section shopping">
      <h2>{t('shopping.title')}</h2>
      {failed && <p role="alert" className="field-error">{t('shopping.error')}</p>}
      <form className="shopping-add" onSubmit={submit} noValidate>
        <label htmlFor="shopping-custom">{t('shopping.customLabel')}</label>
        <div className="shopping-add-row">
          <input
            id="shopping-custom"
            type="text"
            value={draft}
            autoComplete="off"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? ERROR_ID : undefined}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit">{t('shopping.customAdd')}</button>
        </div>
        {fieldError && (
          <p id={ERROR_ID} className="field-error">
            {fieldError === 'full' ? t('shopping.customFull') : t('shopping.customInvalid')}
          </p>
        )}
      </form>

      <ul className="shopping-list">
        {arranged.toBuy.map(row)}
        {arranged.bought.map(row)}
      </ul>

      {arranged.have.length > 0 && (
        <details className="shopping-have">
          <summary>{format('shopping.haveSection', { n: arranged.have.length })}</summary>
          <ul className="shopping-list">
            {arranged.have.map((line) => (
              <li key={line.key} className="shopping-row">
                <span className="shopping-line shopping-line--plain">{line.text}</span>
                <button type="button" className="button-quiet shopping-side" onClick={() => void changeMark(line.key, null)}>
                  {t('shopping.restore')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button type="button" className="button-quiet shopping-copy" onClick={() => void copyList()}>
        {t('shopping.copy')}
      </button>
      <p role="status" className="shopping-status">
        {copy?.state === 'copied' && t('shopping.copied')}
        {copy?.state === 'failed' && t('shopping.copyFailed')}
      </p>
      {copy?.state === 'failed' && <textarea readOnly value={copy.text} aria-label={t('shopping.copy')} rows={6} />}
    </section>
  );
}
