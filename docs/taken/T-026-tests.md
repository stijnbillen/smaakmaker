# T-026 — Tests (R-025 app-icoon)

Geschreven: `tests/helpers/png.ts` (nieuw), `tests/unit/app-icon.test.ts` (nieuw), `tests/build/manifest.test.ts` (uitgebreid), `tests/e2e/manifest.spec.ts` (uitgebreid).
`npx tsc --noEmit` slaagt. De vitest-run van `app-icon.test.ts` kon ik niet starten (commando vraagt goedkeuring in deze sessie); de tests falen nu normaal omdat de iconen en het script er nog niet zijn.

## Gedekt
1. SVG vlak, viewBox 512, geen text/image/use/gradient/filter/extern/data: — `app-icon.test.ts` (icon.svg).
2. Fills = `--color-bg` of `--color-accent` (beide aanwezig); gelijk aan `background_color`/`theme_color` in `vite.config.ts`. `theme-color.test.ts` ongewijzigd.
3. Vijf PNG's met exacte afmetingen (IHDR); maskable: elke pixel buiten cirkel r = 204,8 rond (256,256) heeft achtergrondkleur (tolerantie 8).
4. `index.html`: svg-icon, favicon 32x32, apple-touch-icon; bestanden bestaan met juiste afmetingen; oude `icon-192.png`-link weg. Build-test: 192 any, 512 any, 512 maskable, aparte bestanden, extra bestanden in `dist/icons`. E2E: drie `link`-elementen en bereikbaar.
5. Midden- en hoekpixel van alle PNG's, ≥20% mutskleur in favicon, tegenproef met effen rode PNG (en effen mutskleur = 100%).
6. `package.json` dependencies letterlijk vergeleken; imports van `scripts/make-icons.mjs` alleen `node:*` of bestaande pakketten.
7. `short_name === 'Smaakmaker'` (naast bestaande `name`).

## Niet gedekt
- "Zelf getekend, zonder snor": oordeel van de reviewer (screenshot van de 512-PNG), zoals in de brief.
- Het script zelf draaien: bewust niet (Chromium nodig); versheid wordt via kleurvergelijking SVG/PNG met tokens bewaakt.

## Herstelronde (blokkade ontwikkelaar: Playwright-run niet af te wachten)
Geen fout in de tests gevonden; er is niets gewijzigd. Statisch nagelopen: alle imports (`readTokens`, `parseColor`, `decodePng`, `pixelAt`, `readPngSize`, `solidPng`) bestaan in `tests/helpers/`. De nieuwe e2e-test in `manifest.spec.ts` is licht (één `goto('/')` plus drie `GET`'s). De trage stap is de `webServer` van Playwright (`npm run build` plus preview, timeout 180 s) en de rest van de e2e-suite. Dat is geen testfout. Draai voor T-026 gericht: `npx vitest run tests/unit/app-icon.test.ts tests/unit/theme-color.test.ts tests/build/manifest.test.ts` en `npx playwright test tests/e2e/manifest.spec.ts`. Ik kon zelf niets draaien: de sessie weigert die commando's zonder goedkeuring.

## Opmerkingen voor de ontwikkelaar
- `icon.svg` moet `fill`-attributen gebruiken (geen `style`/CSS) met de letterlijke tokenwaarden, in kleine of hoofdletters maakt niet uit.
- Geen `stroke` anders dan `none`.
- Geen testnaad nodig in productiecode.
