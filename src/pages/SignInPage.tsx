import { useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { useConnection } from '../components/ConnectionProvider';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { t, type TextKey, useLanguage } from '../i18n/t';
import { requestCode, verifyCode, type AuthField, type AuthResult } from '../lib/auth';
import { isSixDigitCode, isValidEmail } from '../lib/validation';

const KEY = 'sign-in';

type Errors = Partial<Record<AuthField, TextKey>>;

/** Sign-in screen, without navigation bar: step 1 asks for the mail, step 2 for the code from the mail. */
export function SignInPage() {
  useLanguage();
  const { session, loading } = useAuth();
  const { report, resolve } = useConnection();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [withInvite, setWithInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [mailCode, setMailCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Double taps must not send two mails; state alone is too late within one event loop turn.
  const busyRef = useRef(false);

  // Already signed in (also right after a correct code): RequireAuth decides between app and welcome.
  if (!loading && session) return <Navigate to="/" replace />;

  /** Runs one request; shows its field message, or hands a connection error to the banner. */
  async function run(action: () => Promise<AuthResult>, retry: () => void, onOk: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErrors({});
    const result = await action();
    busyRef.current = false;
    setBusy(false);
    if (result.ok) {
      resolve(KEY);
      onOk();
      return;
    }
    if (report(KEY, result.cause, result.status, retry)) return;
    if (result.message) setErrors({ [result.field]: result.message });
  }

  function sendCode() {
    const address = email.trim();
    if (!isValidEmail(address)) {
      setErrors({ email: 'auth.emailInvalid' });
      return;
    }
    const invite = withInvite ? inviteCode.trim() : '';
    if (withInvite && invite === '') {
      setErrors({ invite: 'auth.codeInvalid' });
      return;
    }
    void run(
      () => requestCode(address, { inviteCode: invite || undefined }),
      sendCode,
      () => setStep('code'),
    );
  }

  function submitMailCode() {
    const token = mailCode.trim();
    if (!isSixDigitCode(token)) {
      setErrors({ code: 'auth.codeInvalid' });
      return;
    }
    // On success the auth state change sends the user on; nothing to do here.
    void run(() => verifyCode(email, token), submitMailCode, () => undefined);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 'email') sendCode();
    else submitMailCode();
  }

  function back() {
    setStep('email');
    setMailCode('');
    setErrors({});
  }

  return (
    <>
      <ConnectionBanner />
      <main className="page auth-page">
        <p className="auth-brand" aria-hidden="true">
          {t('app.name')}
        </p>
        <h1>{t('auth.title')}</h1>
        <form onSubmit={onSubmit} noValidate>
          {step === 'email' ? (
            <>
              <p>{t('auth.intro')}</p>
              <div className="field">
                <label>
                  {t('auth.emailLabel')}
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                </label>
                {errors.email && (
                  <p id="email-error" role="alert" className="field-error">
                    {t(errors.email)}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="button-link--quiet"
                aria-expanded={withInvite}
                onClick={() => setWithInvite((v) => !v)}
              >
                {t('auth.haveInvite')}
              </button>
              {withInvite && (
                <div className="field">
                  <label>
                    {t('auth.inviteLabel')}
                    <input
                      type="text"
                      name="invite"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      aria-invalid={errors.invite ? true : undefined}
                      aria-describedby={errors.invite ? 'invite-error' : undefined}
                    />
                  </label>
                  {errors.invite && (
                    <p id="invite-error" role="alert" className="field-error">
                      {t(errors.invite)}
                    </p>
                  )}
                </div>
              )}
              <button type="submit" disabled={busy}>
                {busy ? t('auth.sending') : t('auth.requestCode')}
              </button>
            </>
          ) : (
            <>
              <p>{t('auth.mailSent')}</p>
              <div className="field">
                <label>
                  {t('auth.mailCodeLabel')}
                  <input
                    type="text"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    value={mailCode}
                    onChange={(e) => setMailCode(e.target.value)}
                    aria-invalid={errors.code ? true : undefined}
                    aria-describedby={errors.code ? 'code-error' : undefined}
                  />
                </label>
                {errors.code && (
                  <p id="code-error" role="alert" className="field-error">
                    {t(errors.code)}
                  </p>
                )}
              </div>
              <button type="submit" disabled={busy}>
                {busy ? t('auth.verifying') : t('auth.submitCode')}
              </button>
              <button type="button" className="button-link--quiet" onClick={back}>
                {t('auth.otherAddress')}
              </button>
            </>
          )}
        </form>
        <LanguageSwitch />
      </main>
    </>
  );
}
