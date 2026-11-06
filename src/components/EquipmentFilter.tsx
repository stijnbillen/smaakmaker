import { useEffect, useState } from 'react';
import { t, useLanguage } from '../i18n/t';
import { toggleEquipment } from '../lib/equipment';
import { fetchEquipmentInUse } from '../lib/recipes';
import { useConnection } from './ConnectionProvider';
import { EquipmentChoices } from './EquipmentChoices';

const KEY = 'equipment-filter-catalog';

interface EquipmentFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
}

/** Equipment choices of the overview; the page keeps the value in the URL. Nothing shows without any equipment. */
export function EquipmentFilter({ value, onChange }: EquipmentFilterProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchEquipmentInUse();
      if (!active) return;
      if (res.error) {
        report(KEY, res.error, res.status, () => void load());
        return;
      }
      resolve(KEY);
      setNames(res.names);
    }
    void load();
    return () => {
      active = false;
      resolve(KEY);
    };
  }, [report, resolve]);

  if (names.length === 0) return null;
  return (
    <fieldset className="form-group equipment-filter">
      <legend>{t('filter.equipment')}</legend>
      <p className="field-hint">{t('filter.equipmentHint')}</p>
      <EquipmentChoices names={[...names, ...value.filter((n) => !names.includes(n))]} selected={value} onToggle={(name) => onChange(toggleEquipment(value, name))} />
    </fieldset>
  );
}
