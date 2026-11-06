import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { AuthLoading } from '../components/AuthLoading';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { useConnection } from '../components/ConnectionProvider';
import { t, type TextKey, useLanguage } from '../i18n/t';
import { supabase } from '../lib/supabase';
import { isValidDisplayName } from '../lib/validation';

const KEY = 'welcome';

/** First sign-in: the user picks the display name shown with their recipes and reviews. */
export function WelcomePage() {
  useLanguage();
  const { session, loading, displayName, setDisplayName } = useAuth();
  const { report, resolve } = useConnection();
  const [name, setName] = useState('');
  const [error, setError] = useState<TextKey | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;
  const mounted = useRef(true);

  // A left screen must not stay registered as a retry action.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolve(KEY);
    };
  }, [resolve]);

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/aanmelden" replace />;
  // Has a name already: nothing to choose, and after saving this takes the user on.
  if (displayName) return <Navigate to="/" replace />;

  const userId = session.user.id;

  async function save() {
    if (savingRef.current) return;
    const value = nameRef.current;
    if (!isValidDisplayName(value)) {
      setError('welcome.nameInvalid');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const { data, error: dbError, status } = await supabase
      .from('profiles')
      .update({ display_name: value.trim() })
      .eq('id', userId)
      .select('display_name')
      .single();
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (dbError) {
      if (!report(KEY, dbError, status, () => void save())) {
        // 23514 = check violation: the database refused the length.
        setError(dbError.code === '23514' ? 'welcome.nameInvalid' : 'welcome.error');
      }
      return;
    }
    resolve(KEY);
    // The stored (trimmed) name; the redirect above then leads to the overview.
    setDisplayName(data.display_name as string);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      <ConnectionBanner />
      <main className="page auth-page">
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.intro')}</p>
        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label>
              {t('welcome.nameLabel')}
              <input
                type="text"
                name="display_name"
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'name-error' : undefined}
              />
            </label>
            {error && (
              <p id="name-error" role="alert" className="field-error">
                {t(error)}
              </p>
            )}
          </div>
          <button type="submit" disabled={saving}>
            {t('welcome.next')}
          </button>
        </form>
      </main>
    </>
  );
}
