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

/** "1 november 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
