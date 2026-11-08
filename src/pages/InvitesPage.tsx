import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useConnection } from '../components/ConnectionProvider';
import { ListState } from '../components/ListState';
import { getLanguage } from '../i18n/language';
import { format, t, useLanguage, type TextKey } from '../i18n/t';
import { formatDateTime } from '../lib/format';
import {
  inviteUser,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type InvitationRow,
  type SendOutcome,
} from '../lib/invites';

const KEY = 'invites';

// These refusals belong to the address that was typed, so they show at the field.
const FIELD_MESSAGES: TextKey[] = ['invites.invalidEmail', 'invites.alreadyMember', 'invites.rateLimited'];

export function InvitesPage() {
  useLanguage();
  const { report, resolve } = useConnection();
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null);
  const [errored, setErrored] = useState(false);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<TextKey | null>(null);
  const [alertText, setAlertText] = useState<TextKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const active = useRef(true);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error, status } = await listInvitations();
    if (!active.current) return;
    if (error || !data) {
      setErrored(true);
      // Connection errors get the global banner; anything else needs its own message.
      setAlertText(report(KEY, error, status, () => void load()) ? null : 'invites.error');
      return;
    }
    resolve(KEY);
    setErrored(false);
    setInvitations(data);
  }, [report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve]);

  /** Runs one send (invite or mail again) with a guard against double taps; shows the outcome. */
  async function run(action: () => Promise<SendOutcome>, retry: () => void, fromForm: boolean) {
    // Ref, not state: two quick taps must not both pass before a re-render.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFieldError(null);
    setAlertText(null);
    setSentTo(null);
    const outcome = await action();
    busyRef.current = false;
    if (!active.current) return;
    setBusy(false);
    if (outcome.ok) {
      resolve(KEY);
      setSentTo(outcome.email);
      if (fromForm) setEmail('');
    } else if (outcome.cause && report(KEY, outcome.cause, outcome.status, retry)) {
      return;
    } else if (outcome.message) {
      if (fromForm && FIELD_MESSAGES.includes(outcome.message)) setFieldError(outcome.message);
      else setAlertText(outcome.message);
    }
    // The invitation exists even when the mail failed, so the list is refreshed in every case.
    if (outcome.ok || outcome.message === 'invites.mailFailed') await load();
  }

  function submit() {
    const address = email;
    void run(() => inviteUser(address, getLanguage()), submit, true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function onResend(address: string) {
    void run(() => resendInvitation(address, getLanguage()), () => onResend(address), false);
  }

  async function onRevoke(address: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { error, status } = await revokeInvitation(address);
    busyRef.current = false;
    if (!active.current) return;
    setBusy(false);
    setRevoking(null);
    if (error) {
      setAlertText(report(KEY, error, status, () => void onRevoke(address)) ? null : 'invites.error');
      return;
    }
    resolve(KEY);
    setAlertText(null);
    setSentTo(null);
    setInvitations((prev) => (prev ?? []).filter((i) => i.email !== address));
  }

  return (
    <main className="page">
      <h1>{t('invites.title')}</h1>
      <form onSubmit={onSubmit} noValidate className="invite-form">
        <div className="field">
          <label>
            {t('invites.emailLabel')}
            <input
              type="email"
              name="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'invite-email-error' : undefined}
            />
          </label>
          {fieldError && (
            <p id="invite-email-error" role="alert" className="field-error">
              {t(fieldError)}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy}>
          {t('invites.submit')}
        </button>
      </form>
      {sentTo && <p role="status">{format('invites.sent', { email: sentTo })}</p>}
      {alertText && <p role="alert">{t(alertText)}</p>}
      {!errored && (
        <ListState items={invitations} loadingText={t('invites.loading')} emptyText={t('invites.empty')}>
          <ul className="invite-list">
            {invitations?.map((i) => (
              <li key={i.email}>
                <span className="invite-email">{i.email}</span>
                <span className="invite-meta">{format('invites.sentOn', { date: formatDateTime(i.sent_at) })}</span>
                <span className="invite-meta">{format('invites.validUntil', { date: formatDateTime(i.expires_at) })}</span>
                <span className="invite-actions">
                  <button type="button" className="button-quiet" onClick={() => onResend(i.email)} disabled={busy}>
                    {t('invites.resend')}
                  </button>
                  <button type="button" className="button-quiet" onClick={() => setRevoking(i.email)} disabled={busy}>
                    {t('invites.revoke')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </ListState>
      )}
      {revoking && (
        <ConfirmDialog
          question={t('invites.revokeQuestion')}
          confirmLabel={t('invites.revokeConfirm')}
          cancelLabel={t('form.cancel')}
          onConfirm={() => void onRevoke(revoking)}
          onCancel={() => setRevoking(null)}
          busy={busy}
        />
      )}
    </main>
  );
}
