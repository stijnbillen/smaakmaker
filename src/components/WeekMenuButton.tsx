import { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../i18n/t';
import { addToWeekMenu, removeFromWeekMenu } from '../lib/weekMenu';
import { useConnection } from './ConnectionProvider';

interface WeekMenuButtonProps {
  recipeId: string;
  /** The state the database reported when the page loaded. */
  initial: boolean;
}

/**
 * Text toggle "add to week menu" / "in week menu". Optimistic: it shows the new state at once and goes back
 * when the database refuses. A tap while a call runs is ignored, so a double tap on "add" cannot end up
 * removing the dish again (the second tap would otherwise toggle it straight back).
 * Own component, not shared with FavoriteButton: the heart queues its last wish, which is the wrong behaviour here.
 */
export function WeekMenuButton({ recipeId, initial }: WeekMenuButtonProps) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [pressed, setPressed] = useState(initial);
  const [message, setMessage] = useState<'full' | 'error' | null>(null);
  const busy = useRef(false);
  const confirmed = useRef(initial);
  const active = useRef(true);
  const key = `week-menu-${recipeId}`;

  // Take over a fresh answer from the database (another recipe, a reload) unless a call is running.
  useEffect(() => {
    active.current = true;
    if (!busy.current) {
      confirmed.current = initial;
      setPressed(initial);
    }
    return () => {
      active.current = false;
      resolve(key);
    };
  }, [recipeId, initial, resolve, key]);

  const run = useCallback(
    async (target: boolean) => {
      busy.current = true;
      setPressed(target);
      setMessage(null);
      const res = await (target ? addToWeekMenu(recipeId) : removeFromWeekMenu(recipeId));
      busy.current = false;
      if (res.error) {
        // Back to what the database has.
        setPressed(confirmed.current);
        if (!active.current) return;
        if ('full' in res && res.full) {
          setMessage('full');
          return;
        }
        // A lost connection gets the banner with a retry of the same wish; any other error an own message.
        const handled = report(key, res.error, res.status, () => void run(target));
        setMessage(handled ? null : 'error');
        return;
      }
      confirmed.current = target;
      if (active.current) resolve(key);
    },
    [recipeId, report, resolve, key],
  );

  const toggle = () => {
    if (busy.current) return;
    void run(!pressed);
  };

  return (
    <>
      <button
        type="button"
        className={pressed ? 'week-menu-button week-menu-button--on' : 'week-menu-button'}
        aria-pressed={pressed}
        onClick={toggle}
      >
        {pressed ? t('weekMenu.added') : t('weekMenu.add')}
      </button>
      {message && (
        <span role="alert" className="field-error week-menu-error">
          {message === 'full' ? t('weekMenu.full') : t('weekMenu.error')}
        </span>
      )}
    </>
  );
}
