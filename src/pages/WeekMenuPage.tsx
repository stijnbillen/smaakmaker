import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useConnection } from '../components/ConnectionProvider';
import { ListState } from '../components/ListState';
import { RecipePhotoPlaceholder } from '../components/RecipePhotoPlaceholder';
import { ServingsStepper } from '../components/ServingsStepper';
import { t, useLanguage } from '../i18n/t';
import { signedUrls } from '../lib/photos';
import {
  clearWeekMenu,
  fetchWeekMenu,
  removeFromWeekMenu,
  setWeekMenuServings,
  type WeekMenuItem,
} from '../lib/weekMenu';

const LOAD_KEY = 'week-menu-load';
const CLEAR_KEY = 'week-menu-clear';

const mainPhoto = (photos: WeekMenuItem['photos']): string | null =>
  photos.find((p) => p.main)?.path ?? photos[0]?.path ?? null;

/** The signed-in user's personal week menu: a list of dishes without days, plus the (future) shopping tab. */
export function WeekMenuPage({ tab }: { tab: 'menu' | 'shopping' }) {
  useLanguage();
  const { report, resolve } = useConnection();
  const [items, setItems] = useState<WeekMenuItem[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  // The servings the database has per recipe, and the latest wish per recipe: only the last wish counts.
  const confirmed = useRef(new Map<string, number>());
  const wished = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    const res = await fetchWeekMenu();
    if (!active.current) return;
    if (res.error) {
      setFailed(!report(LOAD_KEY, res.error, res.status, () => void load()));
      return;
    }
    resolve(LOAD_KEY);
    setFailed(false);
    confirmed.current = new Map(res.items.map((i) => [i.recipeId, i.servings]));
    wished.current.clear();
    setItems(res.items);
  }, [report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(LOAD_KEY);
      resolve(CLEAR_KEY);
    };
  }, [load, resolve]);

  // Signed URLs for the main photos (the bucket is private); the list does not wait for them.
  useEffect(() => {
    const paths = (items ?? []).flatMap((i) => {
      const p = mainPhoto(i.photos);
      return p ? [p] : [];
    });
    if (paths.length === 0) return;
    let live = true;
    void signedUrls(paths).then((urls) => {
      if (live) setPhotoUrls(urls);
    });
    return () => {
      live = false;
    };
  }, [items]);

  const patch = (recipeId: string, servings: number) =>
    setItems((list) => list?.map((i) => (i.recipeId === recipeId ? { ...i, servings } : i)) ?? list);

  const changeServings = useCallback(
    async (recipeId: string, servings: number) => {
      const key = `week-menu-servings-${recipeId}`;
      wished.current.set(recipeId, servings);
      patch(recipeId, servings);
      const { error, status } = await setWeekMenuServings(recipeId, servings);
      // A newer tap has taken over: its answer decides.
      if (wished.current.get(recipeId) !== servings) return;
      if (error) {
        // Back to what the database has; a lost connection offers a retry of the same wish.
        const back = confirmed.current.get(recipeId);
        if (back !== undefined && active.current) patch(recipeId, back);
        wished.current.delete(recipeId);
        if (active.current) {
          const handled = report(key, error, status, () => void changeServings(recipeId, servings));
          setFailed(!handled);
        }
        return;
      }
      confirmed.current.set(recipeId, servings);
      wished.current.delete(recipeId);
      if (active.current) resolve(key);
    },
    [report, resolve],
  );

  const remove = useCallback(
    async (recipeId: string) => {
      const key = `week-menu-remove-${recipeId}`;
      const { error, status } = await removeFromWeekMenu(recipeId);
      if (!active.current) return;
      if (error) {
        setFailed(!report(key, error, status, () => void remove(recipeId)));
        return;
      }
      resolve(key);
      setFailed(false);
      setItems((list) => list?.filter((i) => i.recipeId !== recipeId) ?? list);
    },
    [report, resolve],
  );

  const clear = useCallback(async () => {
    setClearing(true);
    const { error, status } = await clearWeekMenu();
    if (!active.current) return;
    setClearing(false);
    if (error) {
      setFailed(!report(CLEAR_KEY, error, status, () => void clear()));
      return;
    }
    resolve(CLEAR_KEY);
    setFailed(false);
    setItems([]);
  }, [report, resolve]);

  const empty = t('weekMenu.empty');
  const tabs = [
    { id: 'menu', to: '/weekmenu', label: t('weekMenu.tabMenu') },
    { id: 'shopping', to: '/weekmenu/boodschappen', label: t('weekMenu.tabShopping') },
  ] as const;

  return (
    <main className="page">
      <h1>{t('weekMenu.title')}</h1>
      <div role="tablist" className="week-menu-tabs">
        {tabs.map((x) => (
          <Link key={x.id} to={x.to} role="tab" aria-selected={tab === x.id} className="week-menu-tab">
            {x.label}
          </Link>
        ))}
      </div>
      {failed && <p role="alert" className="field-error">{t('weekMenu.error')}</p>}
      {tab === 'menu' ? (
        <>
          <ListState items={items} loadingText={t('weekMenu.loading')} emptyText={empty}>
            <ul className="week-menu-list">
              {items?.map((item) => {
                const path = mainPhoto(item.photos);
                const src = path ? photoUrls.get(path) : undefined;
                return (
                  <li key={item.recipeId} className="week-menu-card">
                    <span className="recipe-photo week-menu-photo">
                      {!src && <RecipePhotoPlaceholder />}
                      {src && (
                        <img
                          src={src}
                          alt={t('photos.alt').replace('{n}', '1').replace('{title}', item.title)}
                          loading="lazy"
                        />
                      )}
                    </span>
                    <Link to={`/recept/${item.recipeId}`} className="week-menu-title">
                      {item.title}
                    </Link>
                    <ServingsStepper value={item.servings} onChange={(n) => void changeServings(item.recipeId, n)} />
                    <button
                      type="button"
                      className="button-quiet"
                      aria-label={t('weekMenu.removeLabel').replace('{title}', item.title)}
                      onClick={() => void remove(item.recipeId)}
                    >
                      {t('weekMenu.remove')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ListState>
          {items && items.length > 0 && (
            <button type="button" className="button-quiet week-menu-clear" disabled={clearing} onClick={() => setConfirming(true)}>
              {t('weekMenu.clear')}
            </button>
          )}
        </>
      ) : items && items.length > 0 ? (
        // R-032 fills this section; for now it only has its heading.
        <section className="recipe-section">
          <h2>{t('shopping.title')}</h2>
        </section>
      ) : (
        <ListState items={items} loadingText={t('weekMenu.loading')} emptyText={empty}>
          {null}
        </ListState>
      )}
      {confirming && (
        <ConfirmDialog
          question={t('weekMenu.clearQuestion')}
          confirmLabel={t('weekMenu.clearConfirm')}
          cancelLabel={t('form.cancel')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void clear();
          }}
        />
      )}
    </main>
  );
}
