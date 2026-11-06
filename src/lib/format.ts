import { locale } from '../i18n/language';
import { format } from '../i18n/t';

// Brussels zone fixed: a recipe made late in the evening must show the Belgian day on every phone.
// One formatter per locale, built on first use and kept: building an Intl formatter is not free.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(): Intl.DateTimeFormat {
  const loc = locale();
  let f = dateFormats.get(loc);
  if (!f) {
    f = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels' });
    dateFormats.set(loc, f);
  }
  return f;
}

function timeFormat(): Intl.DateTimeFormat {
  const loc = locale();
  let f = timeFormats.get(loc);
  if (!f) {
    f = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Brussels' });
    timeFormats.set(loc, f);
  }
  return f;
}

/** "9 november 2026 om 14:05" / "9 November 2026 at 14:05": invite expiry sits on the second, so the hour is shown. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return format('format.dateTime', { date: dateFormat().format(d), time: timeFormat().format(d) });
}

/** 0 -> "0 min", 90 -> "1 u 30 min" / "1 h 30 min", 4320 -> "72 u". Hours never roll over into days. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(format('time.hours', { h }));
  if (m > 0 || h === 0) parts.push(format('time.minutes', { m }));
  return parts.join(' ');
}

/** "1 november 2026" / "1 November 2026" */
export function formatDate(iso: string): string {
  return dateFormat().format(new Date(iso));
}
