import { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../i18n/t';
import { addFavorite, removeFavorite } from '../lib/favorites';
import { useAuth } from './AuthProvider';
import { useConnection } from './ConnectionProvider';

interface FavoriteButtonProps {
  recipeId: string;
  /** The state the database reported when the page loaded. */
  initial: boolean;
}

/**
 * What the client knows about one recipe, shared by every heart of that recipe (overview and detail page).
 * It outlives a page: a tap on the detail page followed by "back" must show the new state on the overview
 * even when the database call is still running.
 */
interface Entry {
  /** What the database has, as far as we know. */
  confirmed: boolean;
  /** What the user wants; differs from `confirmed` while a call runs or waits. */
  wanted: boolean;
  busy: boolean;
  listeners: Set<(pressed: boolean) => void>;
}

const entries = new Map<string, Entry>();

function entryFor(entryKey: string, initial: boolean): Entry {
  let entry = entries.get(entryKey);
  if (!entry) {
    entry = { confirmed: initial, wanted: initial, busy: false, listeners: new Set() };
    entries.set(entryKey, entry);
  }
  return entry;
}

const publish = (entry: Entry, pressed: boolean) => entry.listeners.forEach((listener) => listener(pressed));

/**
 * Heart toggle. Optimistic: it shows the new state at once and goes back when the database refuses.
 * Taps during a running call are not sent at once: only the last wish counts, so a late answer
 * can never put an older choice back.
 */
export function FavoriteButton({ recipeId, initial }: FavoriteButtonProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const key = `favorite-${recipeId}`;
  const { session } = useAuth();
  // Per user: a call still running at sign-out must not hand its wish to the next user in this tab.
  const entryKey = `${session?.user.id ?? ''}:${recipeId}`;

  // A call that is still running knows better than the list that was fetched before it finished.
  const [pressed, setPressed] = useState(() => {
    const entry = entryFor(entryKey, initial);
    return entry.busy ? entry.wanted : initial;
  });

  const sync = useCallback(async () => {
    const entry = entryFor(entryKey, initial);
    if (entry.busy) return;
    entry.busy = true;
    while (entry.confirmed !== entry.wanted) {
      const target = entry.wanted;
      const { error, status } = await (target ? addFavorite(recipeId) : removeFavorite(recipeId));
      if (error) {
        // Back to what the database has. A lost connection gets the banner with a retry of the same wish;
        // any other error gets an own message. A heart that is no longer on screen cannot show either.
        entry.wanted = entry.confirmed;
        publish(entry, entry.confirmed);
        if (active.current) {
          const handled = report(key, error, status, () => {
            entry.wanted = target;
            publish(entry, target);
            void sync();
          });
          setFailed(!handled);
        }
        break;
      }
      entry.confirmed = target;
      if (active.current) {
        resolve(key);
        setFailed(false);
      }
    }
    entry.busy = false;
  }, [recipeId, entryKey, initial, report, resolve, key]);

  // Follow the shared entry, and take over a fresh answer from the database unless a call is running.
  useEffect(() => {
    active.current = true;
    const entry = entryFor(entryKey, initial);
    if (!entry.busy) {
      entry.confirmed = initial;
      entry.wanted = initial;
    }
    setPressed(entry.wanted);
    entry.listeners.add(setPressed);
    return () => {
      active.current = false;
      entry.listeners.delete(setPressed);
      resolve(key);
    };
  }, [entryKey, initial, resolve, key]);

  const toggle = () => {
    const entry = entryFor(entryKey, initial);
    entry.wanted = !entry.wanted;
    publish(entry, entry.wanted);
    setFailed(false);
    void sync();
  };

  return (
    <>
      <button
        type="button"
        className={pressed ? 'favorite-button favorite-button--on' : 'favorite-button'}
        aria-pressed={pressed}
        aria-label={pressed ? t('favorites.remove') : t('favorites.add')}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path
            d="M12 20.5s-8-4.8-8-10.6C4 6.9 6.1 5 8.5 5c1.5 0 2.7.8 3.5 2 .8-1.2 2-2 3.5-2C17.9 5 20 6.9 20 9.9c0 5.8-8 10.6-8 10.6z"
            fill={pressed ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {failed && (
        <span role="alert" className="field-error favorite-error">
          {t('favorites.error')}
        </span>
      )}
    </>
  );
}
