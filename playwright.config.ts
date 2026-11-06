import { defineConfig } from '@playwright/test';
import { getLocalConfig } from './tests/helpers/supabase-admin';

// The preview build gets the local (public) Supabase settings; tests never use a cloud project.
const { url, anonKey } = getLocalConfig();

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Service worker is part of what we test; keep it enabled.
    serviceWorkers: 'allow',
    // T-018 (R-023 crit. 8): the app starts in the browser language; existing tests expect Dutch.
    locale: 'nl-BE',
  },
  projects: [
    {
      name: 'mobiel',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Rebuild with the local keys so the preview matches what tests talk to.
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 180000,
    env: { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey },
  },
});
