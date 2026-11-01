import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly at startup instead of with obscure request errors later.
if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example).');
}

// Only the public key lives in the client; access is enforced by row-level security.
// no-store: the app is online-only, so a recipe added by someone else must never be hidden by an HTTP cache.
// db.retry off: postgrest-js would retry silently with backoff for seconds; we show the
// connection banner right away and let the user retry.
export const supabase = createClient(url, anonKey, {
  db: { retry: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
});
