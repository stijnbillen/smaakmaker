import { useLanguage } from '../i18n/t';
import { findItem, shownName, sortByShownName, type NamedItem } from '../lib/namedItems';

interface EquipmentChoicesProps {
  items: readonly NamedItem[];
  selected: readonly string[];
  /** Gets the canonical name of the tapped item. */
  onToggle: (name: string) => void;
}

/** Toggle buttons for equipment, in the reader's language; shared by the recipe form and the overview filter. */
export function EquipmentChoices({ items, selected, onToggle }: EquipmentChoicesProps) {
  const lang = useLanguage();
  if (items.length === 0) return null;
  return (
    <div className="choice-list">
      {sortByShownName(items, lang).map((item) => (
        <button
          key={item.name}
          type="button"
          className="choice"
          data-tap-target
          aria-pressed={selected.some((name) => findItem([item], name) !== undefined)}
          onClick={() => onToggle(item.name)}
        >
          {shownName(item, lang)}
        </button>
      ))}
    </div>
  );
}
