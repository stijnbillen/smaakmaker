import { t, type TextKey } from '../i18n/t';

// Decorative icons (aria-hidden); the buttons carry their meaning in aria-label.
const icons = {
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  remove: <path d="M6 6l12 12M18 6L6 18" />,
};

interface RowButtonsProps {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** Up, down and remove for one row of a list ("Stap 2 omhoog"); up and down are off at the ends. */
export function RowButtons({ label, index, count, onMove, onRemove }: RowButtonsProps) {
  const item = label;
  const fill = (key: TextKey) => t(key).replace('{item}', item);
  const button = (key: TextKey, icon: keyof typeof icons, disabled: boolean, onClick: () => void) => (
    <button type="button" className="icon-button" aria-label={fill(key)} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {icons[icon]}
      </svg>
    </button>
  );
  return (
    <div className="row-buttons">
      {button('form.moveUp', 'up', index === 0, () => onMove(-1))}
      {button('form.moveDown', 'down', index === count - 1, () => onMove(1))}
      {button('form.remove', 'remove', false, onRemove)}
    </div>
  );
}
