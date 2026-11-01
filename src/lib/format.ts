// Brussels zone fixed: a recipe made late in the evening must show the Belgian day on every phone.
const dateFormat = new Intl.DateTimeFormat('nl-BE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Brussels',
});

/** "1 november 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
