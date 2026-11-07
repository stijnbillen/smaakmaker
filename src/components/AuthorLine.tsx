import { t, useLanguage } from '../i18n/t';
import { formatDate } from '../lib/format';

interface AuthorLineProps {
  /** Display name of the author; null when the author has none (should not happen after /welkom). */
  name: string | null;
  /** ISO timestamp of creation. */
  date: string;
}

/** "Annemie · 1 november 2026". Recipes, and later reviews, show who wrote them and when. */
export function AuthorLine({ name, date }: AuthorLineProps) {
  useLanguage();
  // Without a name only the date shows, no dangling separator.
  const text = name
    ? t('meta.byAuthorOn').replace('{name}', name).replace('{date}', formatDate(date))
    : formatDate(date);
  return <p className="author-line">{text}</p>;
}
