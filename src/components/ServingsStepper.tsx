import { t, useLanguage } from '../i18n/t';
import { SERVINGS_MAX, SERVINGS_MIN } from '../lib/recipe';

interface ServingsStepperProps {
  value: number;
  onChange: (value: number) => void;
}

// Decorative icons (aria-hidden); the buttons carry their meaning in aria-label.
const icons = {
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

/** Controlled: the page owns the value, nothing is stored here. */
export function ServingsStepper({ value, onChange }: ServingsStepperProps) {
  useLanguage();
  const button = (label: string, icon: keyof typeof icons, disabled: boolean, next: number) => (
    <button type="button" className="icon-button servings-button" aria-label={label} disabled={disabled} onClick={() => onChange(next)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {icons[icon]}
      </svg>
    </button>
  );
  return (
    <div className="servings-stepper">
      <span className="servings-label">{t('servings.label')}</span>
      {button(t('servings.decrease'), 'minus', value <= SERVINGS_MIN, value - 1)}
      <output className="servings-value" aria-live="polite">
        {value}
      </output>
      {button(t('servings.increase'), 'plus', value >= SERVINGS_MAX, value + 1)}
    </div>
  );
}
