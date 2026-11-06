import { useEffect, useState } from 'react';
import { t, useLanguage } from '../i18n/t';
import { fetchTags } from '../lib/recipes';
import { tagKey, type TagKind } from '../lib/tags';
import { useConnection } from './ConnectionProvider';
import { TagChoices } from './TagChoices';

interface TagFilterProps {
  kind: TagKind;
  /** Visible group name, already translated. */
  label: string;
  value: string[];
  /** Only the tapped name: the page works out the new choice from the latest URL, so quick taps add up. */
  onToggle: (name: string) => void;
}

/** Tag choices of one group in the overview; the page keeps the value in the URL. */
export function TagFilter({ kind, label, value, onToggle }: TagFilterProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [names, setNames] = useState<string[]>([]);
  const key = `tag-filter-${kind}`;

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
      setNames(res.names);
    }
    void load();
    return () => {
      active = false;
      resolve(key);
    };
  }, [kind, key, report, resolve]);

  if (names.length === 0 && value.length === 0) return null;
  // A name from the URL that the catalogue does not know still gets a button, so the filter can be switched off.
  const shown = [...names];
  for (const name of value) if (!shown.some((n) => tagKey(n) === tagKey(name))) shown.push(name);
  return (
    <fieldset className="form-group equipment-filter">
      <legend>{label}</legend>
      <p className="field-hint">{t('filter.tagsHint')}</p>
      <TagChoices names={shown} selected={value} onToggle={onToggle} />
    </fieldset>
  );
}
