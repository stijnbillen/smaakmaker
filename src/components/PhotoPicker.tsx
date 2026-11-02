import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { t } from '../i18n/t';
import { PhotoError, toJpeg } from '../lib/photoResize';
import { signedUrls } from '../lib/photos';
import { addPhotos, MAX_PHOTOS, moveItem, removePhoto, setMain, type PhotoDraft } from '../lib/recipe';
import { RowButtons } from './RowButtons';

type Message = 'tooMany' | 'notAPhoto' | 'processFailed';

interface PhotoPickerProps {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
  /** True while a photo is being converted, so the form can hold back saving. */
  onBusyChange: (busy: boolean) => void;
}

const ERROR_ID = 'photos-error';
const GALLERY_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

const text = (key: Parameters<typeof t>[0], values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((out, [name, value]) => out.replace(`{${name}}`, String(value)), t(key));

/** Camera and gallery buttons, the previews, and the order / main photo / remove controls. */
export function PhotoPicker({ photos, onChange, onBusyChange }: PhotoPickerProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // The latest list, for the async pick below and for releasing object URLs on unmount.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const mounted = useRef(true);
  // Photos being converted right now, and picks still running.
  const reserved = useRef(0);
  const picks = useRef(0);
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const p of photosRef.current) if (p.blob) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  // Stored photos show through signed URLs (the bucket is private); one call for all of them.
  const missing = photos.filter((p) => p.path && !p.previewUrl && !urls.has(p.path)).map((p) => p.path as string);
  const missingKey = missing.join('|');
  useEffect(() => {
    if (missing.length === 0) return;
    let active = true;
    void signedUrls(missing).then((found) => {
      if (active && found.size > 0) setUrls((old) => new Map([...old, ...found]));
    });
    return () => {
      active = false;
    };
    // missingKey stands for the list of missing paths.
  }, [missingKey]);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // Reset, so choosing the same file again still fires a change.
    event.target.value = '';
    if (files.length === 0) return;
    setMessage(null);
    picks.current += 1;
    setBusy(true);
    onBusyRef.current(true);
    let tooMany = false;
    let failure: Message | null = null;
    // One at a time within a pick: decoding several large photos in parallel can run a small phone out of memory.
    for (const file of files) {
      // Photos still being converted (also from an earlier pick) already count, or two quick picks could pass the maximum.
      if (photosRef.current.length + reserved.current >= MAX_PHOTOS) {
        tooMany = true;
        continue;
      }
      reserved.current += 1;
      try {
        const blob = await toJpeg(file);
        const draft: PhotoDraft = { key: crypto.randomUUID(), blob, previewUrl: URL.createObjectURL(blob), main: false };
        commit(addPhotos(photosRef.current, [draft]).photos);
      } catch (error) {
        failure = error instanceof PhotoError && error.kind === 'processFailed' ? 'processFailed' : 'notAPhoto';
      } finally {
        // Right after commit(), with nothing in between, so the count never dips.
        reserved.current -= 1;
      }
    }
    picks.current -= 1;
    if (!mounted.current) return;
    if (picks.current === 0) {
      setBusy(false);
      onBusyRef.current(false);
    }
    // A pick with nothing to report leaves another pick's message alone.
    if (tooMany || failure) setMessage(tooMany ? 'tooMany' : failure);
  }

  /** This component is the only writer of the list, so the ref is updated at once and stays right between renders. */
  function commit(next: PhotoDraft[]) {
    photosRef.current = next;
    onChange(next);
  }

  function remove(index: number) {
    const gone = photosRef.current[index];
    if (gone?.blob) URL.revokeObjectURL(gone.previewUrl);
    setMessage(null);
    commit(removePhoto(photosRef.current, index));
  }

  const messageText =
    message === 'tooMany' ? t('photos.tooMany') : message === 'notAPhoto' ? t('photos.notAPhoto') : message === 'processFailed' ? t('photos.processFailed') : null;

  return (
    <fieldset className="form-group photo-picker">
      <legend>{t('photos.legend')}</legend>
      <p className="field-hint">{t('photos.hint')}</p>
      <div className="photo-add">
        <button type="button" className="button-quiet" onClick={() => cameraRef.current?.click()}>
          {t('photos.take')}
        </button>
        <button type="button" className="button-quiet" onClick={() => galleryRef.current?.click()}>
          {t('photos.gallery')}
        </button>
        {/* capture opens the camera on a phone; the gallery input has none and allows several files. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e)} />
        <input ref={galleryRef} type="file" accept={GALLERY_ACCEPT} multiple hidden onChange={(e) => void pick(e)} />
      </div>
      {busy && (
        <p role="status" className="list-state list-state--loading">
          <span className="spinner" aria-hidden="true" />
          {t('photos.processing')}
        </p>
      )}
      {messageText && (
        <p role="alert" id={ERROR_ID} className="field-error">
          {messageText}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="row-list photo-list">
          {photos.map((photo, i) => {
            const label = text('photos.item', { n: i + 1 });
            const src = photo.previewUrl || (photo.path ? urls.get(photo.path) : undefined);
            return (
              <li key={photo.key} className="row photo-row">
                <div className="photo-thumb">{src && <img src={src} alt={label} />}</div>
                <div className="photo-controls">
                  <button
                    type="button"
                    className={photo.main ? 'photo-main photo-main--on' : 'photo-main button-quiet'}
                    aria-pressed={photo.main}
                    aria-label={text('photos.asMain', { n: i + 1 })}
                    onClick={() => commit(setMain(photosRef.current, i))}
                  >
                    {photo.main ? t('photos.main') : t('photos.makeMain')}
                  </button>
                  <RowButtons
                    label={label}
                    index={i}
                    count={photos.length}
                    onMove={(direction) => commit(moveItem(photosRef.current, i, direction))}
                    onRemove={() => remove(i)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
