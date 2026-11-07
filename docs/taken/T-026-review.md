# Review T-026 — App-icoon: koksmuts (R-025)

Bekeken: `git diff HEAD` (werkkopie na e76ecbe) plus de nieuwe bestanden `public/icons/icon.svg`, `apple-touch-icon.png`, `favicon-32.png`, `icon-maskable-512.png`, `tests/helpers/png.ts` en `tests/unit/app-icon.test.ts`. Volgens `docs/loop-log.md` is de build met tests geslaagd (2026-11-07 09:34). Zelf kon ik de tests niet draaien: de sessie weigert dat zonder goedkeuring.

## Criteria
1. **SVG, zelf getekend, vlak:** gehaald. Bekeken in `icon-512.png`: een herkenbare koksmuts (wolk van drie cirkels, lijf met twee plooien, aparte band), zonder snor en zonder tekst. De test laat alleen vlakke elementen toe en weigert tekst, beelden, verlopen, filters, `data:` en externe verwijzingen.
2. **Kleuren uit de tokens:** gehaald. Het script leest `tokens.css` en lost `var()` op. De test vergelijkt elke `fill` met `--color-bg` en `--color-accent`, en die met `background_color` en `theme_color`. De lezing per kleur staat in `T-026.md` en volgt het manifest van T-002.
3. **Afgeleide bestanden plus maskable-zone:** gehaald. Nagerekend: bij schaal 0,82 ligt het verste punt van de muts (hoek van de band) op ongeveer 176 px van het midden. De grens is 204,8 px. De test controleert elke pixel buiten die cirkel.
4. **Verwijzingen:** gehaald. Het manifest heeft `any` 192/512 en `maskable` 512, en `index.html` heeft de drie links. De tests controleren of elk bestand bestaat en de juiste afmetingen heeft, in `public/` en in `dist/`. Een e2e-test haalt de drie bestanden op.
5. **Pixelcontrole:** gehaald. Er is een tegenproef: een effen rode PNG haalt minder dan 20%, een effen crème PNG telt als 100%. De test kan dus echt falen.
6. **Script zonder nieuwe pakketten:** gehaald. Het script gebruikt `@playwright/test`, dat al een devDependency is. De lijst van pakketten staat letterlijk in de test.
7. **Naam:** gehaald. `name` en `short_name` zijn allebei "Smaakmaker" en worden getest.

`CLAUDE.md` is in deze taak niet gewijzigd. De kernbeslissingen blijven gerespecteerd: geen zichtbare tekst toegevoegd, geen sleutels, kleuren via tokens.

## Bevindingen

### 1. `tests/e2e/recipe-detail.spec.ts:62` — laag — tester/ontwikkelaar
**Probleem:** `test.use({ serviceWorkers: 'block' })` in de describe-blok `author` hoort niet bij R-025. Het gaat om een aanpassing aan een test van een andere taak. De reden staat in het commentaar: zodra de service worker de pagina beheert, ziet `page.route` de DELETE niet meer. De wijziging is waarschijnlijk nodig geworden doordat de precache groeide, maar de taak vermeldt dit nergens.
**Voorstel:** noteer het kort onder T-026 in `docs/beslissingen.md`, zodat later duidelijk is waarom een test van de receptdetailpagina in deze taak veranderde. Kijk na of andere e2e-tests die `page.route` gebruiken hetzelfde risico lopen.

### 2. `tests/unit/app-icon.test.ts:58-61` — laag — tester
**Probleem:** de test "has at least one flat shape for the hat" eist alleen één `circle`, `ellipse` of `path`. Hij voegt niets toe aan criterium 1: de kleurtest en de pixeltest dekken al dat er een crème vorm is.
**Voorstel:** schrappen, of vervangen door iets met inhoud. Bijvoorbeeld een controle dat de SVG ook crème vormen buiten het midden heeft, zodat een eenvoudig vierkant niet slaagt. Niet blokkerend: of het een muts is, blijft een oordeel van de reviewer.

### 3. `scripts/make-icons.mjs:2` — laag — ontwikkelaar
**Probleem:** het script hangt af van een lokaal geïnstalleerde Chromium en van `process.cwd()` (relatieve paden zoals `src/styles/tokens.css` en `public/icons`). Draai je het vanuit een andere map, dan faalt het met een onduidelijke `ENOENT`.
**Voorstel:** maak de paden relatief aan `import.meta.url`, of vermeld in het commentaar bovenaan dat het script vanuit de root van de repo moet draaien.
