import { tagKey } from '../lib/tags';

interface TagChoicesProps {
  names: readonly string[];
  selected: readonly string[];
  onToggle: (name: string) => void;
}

/** Toggle buttons for the tags of one group; shared by the recipe form and the overview filter. */
export function TagChoices({ names, selected, onToggle }: TagChoicesProps) {
  if (names.length === 0) return null;
  const selectedKeys = new Set(selected.map(tagKey));
  return (
    <div className="choice-list">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          className="choice"
          data-tap-target
          aria-pressed={selectedKeys.has(tagKey(name))}
          onClick={() => onToggle(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
