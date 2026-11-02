import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Smaakmaker',
        short_name: 'Smaakmaker',
        lang: 'nl',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Literal colours (no CSS variable possible); tests keep them equal to --color-bg and --color-theme.
        background_color: '#fbf5ea',
        theme_color: '#a8321a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // App is online-only: precache the app shell, never cache database/auth responses.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        // The HEIC decoder (about 3 MB) is loaded on first use, online; keeping it out of the precache
        // keeps the install small and the app shell fast.
        globIgnores: ['**/heic-to-*.js'],
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//],
        runtimeCaching: [],
      },
    }),
  ],
});
