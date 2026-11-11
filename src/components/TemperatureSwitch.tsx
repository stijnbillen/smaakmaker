import { useId } from 'react';
import { t, useLanguage } from '../i18n/t';
import type { TemperatureUnit } from '../lib/temperature';
import { setTemperatureUnit, useTemperatureUnit } from '../lib/temperatureUnit';

const UNITS: { code: TemperatureUnit; label: 'temperature.celsius' | 'temperature.fahrenheit' }[] = [
  { code: 'C', label: 'temperature.celsius' },
  { code: 'F', label: 'temperature.fahrenheit' },
];

/** Two toggle buttons, same build as LanguageSwitch. */
export function TemperatureSwitch() {
  useLanguage();
  const current = useTemperatureUnit();
  const labelId = useId();
  return (
    <div className="language-switch" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="language-switch-label">
        {t('temperature.label')}
      </span>
      <div className="choice-list">
        {UNITS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className="choice"
            aria-pressed={current === code}
            onClick={() => setTemperatureUnit(code)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
