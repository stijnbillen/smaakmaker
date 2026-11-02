import { t } from '../i18n/t';

// Brussels zone fixed: a recipe made late in the evening must show the Belgian day on every phone.
const dateFormat = new Intl.DateTimeFormat('nl-BE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Brussels',
});

const timeFormat = new Intl.DateTimeFormat('nl-BE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Brussels',
});

/** "9 november 2026 om 14:05": invite expiry sits on the second, so the hour is shown. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dateFormat.format(d)} om ${timeFormat.format(d)}`;
}

/** 0 -> "0 min", 90 -> "1 u 30 min", 4320 -> "72 u". Hours never roll over into days. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(t('time.hours').replace('{h}', String(h)));
  if (m > 0 || h === 0) parts.push(t('time.minutes').replace('{m}', String(m)));
  return parts.join(' ');
}

/** "1 november 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
