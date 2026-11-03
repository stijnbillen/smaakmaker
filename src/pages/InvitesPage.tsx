import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '../components/ConnectionProvider';
import { ListState } from '../components/ListState';
import { t } from '../i18n/t';
import { formatDateTime } from '../lib/format';
import { createInvite, listInvites, type InviteRow } from '../lib/invites';

const KEY = 'invites';
const statusText = {
  open: 'invites.status.open',
  gebruikt: 'invites.status.used',
  verlopen: 'invites.status.expired',
} as const;

export function InvitesPage() {
  const { report, resolve } = useConnection();
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [errored, setErrored] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const active = useRef(true);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error, status } = await listInvites();
    if (!active.current) return;
    if (error || !data) {
      setErrored(true);
      // Connection errors get the global banner; anything else needs its own message.
      setFailed(!report(KEY, error, status, () => void load()));
      return;
    }
    resolve(KEY);
    setErrored(false);
    setFailed(false);
    setInvites(data);
  }, [report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve]);

  async function onNew() {
    // Ref, not state: two quick taps must not both pass before a re-render.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { data, error, status } = await createInvite();
    busyRef.current = false;
    if (!active.current) return;
    setBusy(false);
    if (error || !data) {
      setFailed(!report(KEY, error, status, () => void onNew()));
      return;
    }
    resolve(KEY);
    setFailed(false);
    setInvites((prev) => [data, ...(prev ?? [])]);
  }

  async function onCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      // Clipboard refused (permission): the code stays visible to copy by hand.
    }
  }

  return (
    <main className="page">
      <h1>{t('invites.title')}</h1>
      <button type="button" onClick={() => void onNew()} disabled={busy}>
        {t('invites.new')}
      </button>
      {failed && <p role="alert">{t('invites.error')}</p>}
      {!errored && (
        <ListState items={invites} loadingText={t('invites.loading')} emptyText={t('invites.empty')}>
          <ul className="invite-list">
            {invites?.map((i) => (
              <li key={i.code}>
                <span className="invite-code">{i.code}</span>
                <span className={`invite-status invite-status--${i.status}`}>{t(statusText[i.status])}</span>
                {i.status === 'gebruikt' && (
                  <span className="invite-meta">
                    {t('invites.usedBy')} {i.used_by_name ?? t('invites.unknownUser')}
                  </span>
                )}
                <span className="invite-meta">
                  {t('invites.expiresOn').replace('{date}', formatDateTime(i.expires_at))}
                </span>
                <button type="button" className="invite-copy" onClick={() => void onCopy(i.code)}>
                  {t('invites.copy')}
                </button>
                {copied === i.code && (
                  <span role="status" className="invite-meta">
                    {t('invites.copied')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ListState>
      )}
    </main>
  );
}
