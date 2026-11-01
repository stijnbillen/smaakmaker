import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConnection } from '../components/ConnectionProvider';
import { t } from '../i18n/t';
import { supabase } from '../lib/supabase';

const KEY = 'new-recipe';

// Provisional form (T-001): R-003 replaces it with the full recipe form.
export function NewRecipePage() {
  const { report, resolve } = useConnection();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [error, setError] = useState(false);
  // Retry must save what is in the field now, not what was typed at the first attempt.
  const titleRef = useRef(title);
  titleRef.current = title;

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);

  // A left form must not stay registered as a retry action: retrying would insert an abandoned recipe.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolve(KEY);
    };
  }, [resolve]);

  const save = useCallback(async () => {
    // Ignore double taps while a request is running.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const { error: dbError, status } = await supabase.from('recipes').insert({ title: titleRef.current });
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (dbError) {
      setError(!report(KEY, dbError, status, () => void save()));
      return;
    }
    resolve(KEY);
    navigate('/');
  }, [report, resolve, navigate]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(false);
    void save();
  }

  return (
    <main className="page">
      <h1>{t('form.title')}</h1>
      <form onSubmit={onSubmit}>
        <label>
          {t('form.titleLabel')}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        {error && <p role="status">{t('form.error')}</p>}
        <button type="submit" disabled={saving}>{t('form.save')}</button>
      </form>
      <Link to="/" className="button-link">
        {t('form.back')}
      </Link>
    </main>
  );
}
