import { useEffect, useState } from 'react';
import { t, useLanguage } from '../i18n/t';
import { toggleEquipment } from '../lib/equipment';
import { findItem, type NamedItem } from '../lib/namedItems';
import { fetchEquipmentChoices } from '../lib/recipes';
import { useConnection } from './ConnectionProvider';
import { EquipmentChoices } from './EquipmentChoices';

const KEY = 'equipment-filter-catalog';

interface EquipmentFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
}

/** Equipment choices of the overview; the page keeps the value in the URL. The start list is always offered. */
export function EquipmentFilter({ value, onChange }: EquipmentFilterProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [items, setItems] = useState<NamedItem[]>([]);

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
      setItems(res.items);
    }
    void load();
    return () => {
      active = false;
      resolve(KEY);
    };
  }, [report, resolve]);

  // The start list is always there; this only stays empty while loading or when the load failed.
  if (items.length === 0) return null;
  // A name from the URL that the list does not know still gets a button, so the filter can be switched off.
  const shown = [...items];
  for (const name of value) if (!findItem(shown, name)) shown.push({ name, nameFr: null });
  // Remove by the item a (possibly French) URL name belongs to.
  const toggle = (name: string) => {
    const item = shown.find((i) => i.name === name) ?? { name, nameFr: null };
    const same = value.find((n) => findItem([item], n));
    onChange(toggleEquipment(value, same ?? name));
  };
  return (
    <fieldset className="form-group equipment-filter">
      <legend>{t('filter.equipment')}</legend>
      <p className="field-hint">{t('filter.equipmentHint')}</p>
      <EquipmentChoices items={shown} selected={value} onToggle={toggle} />
    </fieldset>
  );
}
