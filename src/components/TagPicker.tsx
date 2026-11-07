import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { t, useLanguage } from '../i18n/t';
import { findItem, type NamedItem } from '../lib/namedItems';
import { fetchTags } from '../lib/recipes';
import { addTag, TAGS_MAX_ITEMS, tagKey, toggleTag, validateTagName, type TagKind } from '../lib/tags';
import { useConnection } from './ConnectionProvider';
import { TagChoices } from './TagChoices';

interface TagPickerProps {
  kind: TagKind;
  /** Visible group name, already translated. */
  label: string;
  hint: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Save-time validation found more than the allowed number of tags. */
  tooMany?: boolean;
  /** Fixed id of the message, so tests and assistive technology can find it. */
  errorId: string;
}

/** Choose tags from the shared catalogue of a group or add a new name. No maxlength: a long paste shows the message. */
export function TagPicker({ kind, label, hint, selected, onChange, tooMany, errorId }: TagPickerProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const base = useId();
  const [catalog, setCatalog] = useState<NamedItem[]>([]);
  // Names added in this session stay as buttons when deselected again, so a mis-tap can be undone.
  const [added, setAdded] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<'tagInvalid' | 'tagsTooMany' | null>(null);
  const key = `tags-${kind}`;

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchTags(kind);
      if (!active) return;
      if (res.error) {
        report(key, res.error, res.status, () => void load());
        return;
      }
      resolve(key);
      setCatalog(res.items);
    }
    void load();
    return () => {
      active = false;
      resolve(key);
    };
  }, [kind, key, report, resolve]);

  // Catalogue first, then names added or selected that it does not know (yet; one name, in both languages).
  const shown = [...catalog];
  for (const name of [...selected, ...added]) if (!findItem(shown, name)) shown.push({ name, nameFr: null });

  function add() {
    if (!validateTagName(text).ok) {
      setError('tagInvalid');
      return;
    }
    const next = addTag(selected, shown, text);
    if (next.length > TAGS_MAX_ITEMS) {
      setError('tagsTooMany');
      return;
    }
    const name = next.find((n) => !selected.includes(n)) ?? next[next.length - 1];
    if (name && !findItem(shown, name)) setAdded((list) => [...list, name]);
    setError(null);
    setText('');
    onChange(next);
  }

  // Enter would submit the whole recipe form; here it means "add".
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  }

  function toggle(name: string) {
    // Remove by key so a spelling that differs from the button still unselects.
    const current = selected.find((n) => tagKey(n) === tagKey(name));
    const next = current ? toggleTag(selected, current) : toggleTag(selected, name);
    if (next.length > TAGS_MAX_ITEMS) {
      setError('tagsTooMany');
      return;
    }
    setError(null);
    onChange(next);
  }

  const inputId = `${base}-new`;
  const shownError = error ?? (tooMany ? 'tagsTooMany' : null);
  return (
    <fieldset className="form-group">
      <legend>{label}</legend>
      <p className="field-hint">{hint}</p>
      <TagChoices items={shown} selected={selected} onToggle={toggle} />
      <div className="field">
        <label htmlFor={inputId}>{t('form.tagNew')}</label>
        <div className="inline-add">
          <input
            id={inputId}
            type="text"
            value={text}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
          />
          <button type="button" className="button-quiet" onClick={add}>
            {t('form.tagAdd')}
          </button>
        </div>
        {shownError && (
          <p id={errorId} className="field-error">
            {shownError === 'tagInvalid' ? t('form.tagInvalid') : t('form.tagsTooMany')}
          </p>
        )}
      </div>
    </fieldset>
  );
}
