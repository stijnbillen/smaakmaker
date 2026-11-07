import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { t, useLanguage } from '../i18n/t';
import { addEquipment, EQUIPMENT_MAX_ITEMS, toggleEquipment, validateEquipmentName } from '../lib/equipment';
import { findItem, type NamedItem } from '../lib/namedItems';
import { fetchEquipmentChoices } from '../lib/recipes';
import { useConnection } from './ConnectionProvider';
import { EquipmentChoices } from './EquipmentChoices';

const KEY = 'equipment-catalog';

interface EquipmentPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Save-time validation found more than the allowed number of items. */
  tooMany?: boolean;
}

/** Choose equipment from the shared list or add a new name. No maxlength: a long paste shows the message. */
export function EquipmentPicker({ selected, onChange, tooMany }: EquipmentPickerProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const base = useId();
  const [catalog, setCatalog] = useState<NamedItem[]>([]);
  // Names added in this session stay as buttons when deselected again, so a mis-tap can be undone.
  const [added, setAdded] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<'equipmentInvalid' | 'equipmentTooMany' | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchEquipmentChoices();
      if (!active) return;
      if (res.error) {
        report(KEY, res.error, res.status, () => void load());
        return;
      }
      resolve(KEY);
      setCatalog(res.items);
    }
    void load();
    return () => {
      active = false;
      resolve(KEY);
    };
  }, [report, resolve]);

  // Catalogue first, then names added or selected that it does not know (yet).
  const shown = [...catalog];
  for (const name of [...selected, ...added]) if (!findItem(shown, name)) shown.push({ name, nameFr: null });

  function add() {
    if (!validateEquipmentName(text).ok) {
      setError('equipmentInvalid');
      return;
    }
    const next = addEquipment(selected, shown, text);
    if (next.length > EQUIPMENT_MAX_ITEMS) {
      setError('equipmentTooMany');
      return;
    }
    // An item that was already selected leaves the list unchanged; its last entry is not a new one then.
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

  // Block a 21st pick with the same message; a stale save error also shows (selection is already over the limit).
  function toggle(name: string) {
    const next = toggleEquipment(selected, name);
    if (next.length > EQUIPMENT_MAX_ITEMS) {
      setError('equipmentTooMany');
      return;
    }
    setError(null);
    onChange(next);
  }

  const inputId = `${base}-new`;
  const errorId = 'equipment-error';
  const shownError = error ?? (tooMany ? 'equipmentTooMany' : null);
  return (
    <fieldset className="form-group">
      <legend>{t('form.equipment')}</legend>
      <p className="field-hint">{t('form.equipmentHint')}</p>
      <EquipmentChoices items={shown} selected={selected} onToggle={toggle} />
      <div className="field">
        <label htmlFor={inputId}>{t('form.equipmentNew')}</label>
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
            {t('form.equipmentAdd')}
          </button>
        </div>
        {shownError && (
          <p id={errorId} className="field-error">
            {shownError ==='equipmentInvalid' ? t('form.equipmentInvalid') : t('form.equipmentTooMany')}
          </p>
        )}
      </div>
    </fieldset>
  );
}
