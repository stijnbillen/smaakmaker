import { useId } from 'react';
import { setLanguage, type Language } from '../i18n/language';
import { t, useLanguage } from '../i18n/t';

const LANGUAGES: { code: Language; label: 'language.nl' | 'language.fr' }[] = [
  { code: 'nl', label: 'language.nl' },
  { code: 'fr', label: 'language.fr' },
];

/** Two toggle buttons; each language is named in its own language, whatever the interface language is. */
export function LanguageSwitch() {
  const current = useLanguage();
  const labelId = useId();
  return (
    <div className="language-switch" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="language-switch-label">
        {t('language.label')}
      </span>
      <div className="choice-list">
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className="choice"
            lang={code}
            aria-pressed={current === code}
            onClick={() => setLanguage(code)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
