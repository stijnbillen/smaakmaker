import { useEffect, useId, useState } from 'react';
import { format, t, type TextKey, useLanguage } from '../i18n/t';
import { formatDuration } from '../lib/format';
import {
  clampToSlider,
  parseTypedMinutes,
  SLIDER_MAX,
  SLIDER_STEP,
  type TimeFilter as TimeFilterValue,
} from '../lib/timeFilter';

interface TimeFilterProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
}

interface LimitProps {
  label: TextKey;
  sliderLabel: TextKey;
  value: number | null;
  onChange: (value: number | null) => void;
}

const toText = (value: number | null): string => (value === null ? '' : String(value));

function TimeLimit({ label, sliderLabel, value, onChange }: LimitProps) {
  useLanguage();
  const id = useId();
  // The field keeps its own text so a half-typed or rejected entry never fights the URL value.
  const [text, setText] = useState(toText(value));

  // A value that changes from outside (clear all, a link) resets the text; our own edits already match.
  useEffect(() => {
    setText((current) => {
      const typed = parseTypedMinutes(current);
      const same = typed.kind === 'empty' ? value === null : typed.kind === 'value' && typed.minutes === value;
      return same ? current : toText(value);
    });
  }, [value]);

  function handleText(next: string) {
    const typed = parseTypedMinutes(next);
    if (typed.kind === 'invalid') return; // keep the last valid text
    setText(next);
    onChange(typed.kind === 'empty' ? null : typed.minutes);
  }

  function handleRange(next: number) {
    setText(String(next));
    onChange(next);
  }

  function clear() {
    setText('');
    onChange(null);
  }

  return (
    <div className="field time-limit">
      <label htmlFor={id}>{t(label)}</label>
      <div className="time-limit-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={t('filter.noLimit')}
          onChange={(e) => handleText(e.target.value)}
        />
        <span className="time-limit-unit" aria-hidden="true">
          {format('time.minutes', { m: '' }).trim()}
        </span>
      </div>
      <input
        type="range"
        className="time-limit-range"
        min={0}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={value === null ? SLIDER_MAX : clampToSlider(value)}
        aria-label={t(sliderLabel)}
        aria-valuetext={value === null ? t('filter.noLimit') : formatDuration(value)}
        onChange={(e) => handleRange(Number(e.target.value))}
      />
      {value !== null && (
        <button type="button" className="button-quiet" onClick={clear}>
          {t('filter.noLimit')}
        </button>
      )}
    </div>
  );
}

/** Maximum preparation time and maximum total time; the page keeps the value in the URL. */
export function TimeFilter({ value, onChange }: TimeFilterProps) {
  useLanguage();
  return (
    <div className="time-filter">
      <TimeLimit
        label="filter.maxPrep"
        sliderLabel="filter.maxPrepSlider"
        value={value.maxPrep}
        onChange={(maxPrep) => onChange({ ...value, maxPrep })}
      />
      <TimeLimit
        label="filter.maxTotal"
        sliderLabel="filter.maxTotalSlider"
        value={value.maxTotal}
        onChange={(maxTotal) => onChange({ ...value, maxTotal })}
      />
    </div>
  );
}
