import { useId } from 'react';
import { t, type TextKey, useLanguage } from '../i18n/t';
import { formatDuration } from '../lib/format';
import { TIME_FILTER_CHOICES, type TimeFilter as TimeFilterValue } from '../lib/timeFilter';

interface TimeFilterProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
}

interface SelectProps {
  label: TextKey;
  value: number | null;
  onChange: (value: number | null) => void;
}

function TimeSelect({ label, value, onChange }: SelectProps) {
  useLanguage();
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{t('filter.all')}</option>
        {TIME_FILTER_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {formatDuration(minutes)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Maximum preparation time and maximum total time; the page keeps the value in the URL. */
export function TimeFilter({ value, onChange }: TimeFilterProps) {
  useLanguage();
  return (
    <div className="time-filter field-pair">
      <TimeSelect label="filter.maxPrep" value={value.maxPrep} onChange={(maxPrep) => onChange({ ...value, maxPrep })} />
      <TimeSelect label="filter.maxTotal" value={value.maxTotal} onChange={(maxTotal) => onChange({ ...value, maxTotal })} />
    </div>
  );
}
