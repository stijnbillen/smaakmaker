import { supabase } from './supabase';

// Storage calls for recipe photos (R-005). Kept apart from the pure photo code because supabase.ts
// throws at import time without the environment variables.

export const PHOTO_BUCKET = 'recipe-photos';
/** One hour; the bucket is private, so every <img> needs a signed URL. */
const SIGNED_URL_SECONDS = 3600;

export interface UploadResult {
  path: string | null;
  error: unknown;
  status: number | undefined;
}

/** Uploads a JPEG to `<recipeId>/<uuid>.jpg`. upsert is off: the bucket never overwrites. */
export async function uploadPhoto(recipeId: string, blob: Blob): Promise<UploadResult> {
  const path = `${recipeId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) return { path: null, error, status: (error as { status?: number }).status };
  return { path, error: null, status: 200 };
}

/** Best effort: a failure here is not shown to the user, because the recipe itself was saved or deleted. */
export async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  } catch {
    // Left-over files are for the clean-up task (T-013).
  }
}

/** One call for all paths of a screen. Paths that could not be signed are left out of the map. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  try {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const entry of data ?? []) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  } catch {
    // Without URLs the screen shows the placeholder; the rest of the screen works.
  }
  return urls;
}
