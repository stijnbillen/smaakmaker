import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initLanguage } from './i18n/language';
// Self-hosted fonts (Latin subset only, font-display: swap); no external font CDN.
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import './styles/base.css';

// Before the first render, so the page never flashes the wrong language.
initLanguage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
