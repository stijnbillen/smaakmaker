interface EquipmentChoicesProps {
  names: readonly string[];
  selected: readonly string[];
  onToggle: (name: string) => void;
}

/** Toggle buttons for equipment names; shared by the recipe form and the overview filter. */
export function EquipmentChoices({ names, selected, onToggle }: EquipmentChoicesProps) {
  if (names.length === 0) return null;
  return (
    <div className="choice-list">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          className="choice"
          data-tap-target
          aria-pressed={selected.includes(name)}
          onClick={() => onToggle(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
