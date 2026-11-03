# T-002 — review (ronde 2)

Bekeken: diff tegen `0b9b988` (werkkopie, inclusief nieuwe bestanden), `docs/taken/T-002.md`, `T-002-tests.md`, buildlog `logs/T-002-build-170634.log` (Vitest 71/71, Playwright 58/58 geslaagd).
`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden. `VRAGEN.md` heeft geen blok voor T-002.

Bevinding 1 uit ronde 1 (accent als tekst buiten de contrasttest) is opgelost: `--color-text-accent` staat in `tokens.css:22` en wordt gebruikt in `base.css` voor `a`, `.button-link--quiet` en de actieve navigatie-ingang. De bestaande test controleert het token tegenover elke `--color-bg-*`.

## Bevindingen

### 1. Geen laadtoestand tijdens "Opnieuw proberen"
- **Bestand:** `src/pages/RecipeListPage.tsx:32` en `:56`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** na een fout blijft `errored` op `true` tot een geslaagde lading. Tikt de gebruiker op "Opnieuw proberen", dan is er tijdens het nieuwe verzoek geen laadindicator en geen lijst. Het scherm toont alleen de titel. Dat is geen schending van criterium 6, want de eerste lading heeft wel een laadtoestand.
- **Voorstel:** zet aan het begin van `load()` `errored` op `false` en `recipes` op `null`, of houd de oude lijst zichtbaar. Doe dat alleen als het niet botst met de banner-logica uit T-001.

### 2. De rand van invoervelden heeft heel weinig contrast (ongewijzigd uit ronde 1)
- **Bestand:** `src/styles/base.css:67`, `src/styles/tokens.css:25`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `--color-border` (`#d9ccb6`) haalt ongeveer 1,4 : 1 tegenover `--color-bg-surface` en `--color-bg-page`. WCAG 1.4.11 vraagt 3 : 1 voor de rand van een invoerveld. Dit staat niet in de acceptatiecriteria.
- **Voorstel:** geef invoervelden een eigen token `--color-border-strong` van minstens 3 : 1 en controleer dat token mee, zoals `--color-focus`.

### 3. Tekst in `nl.json` die niet meer gebruikt wordt (ongewijzigd uit ronde 1)
- **Bestand:** `src/i18n/nl.json:12` (`overview.new`)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** niets in `src/` verwijst nog naar deze sleutel.
- **Voorstel:** verwijder de sleutel, of laat hem bewust staan voor later hergebruik.

### 4. Bestanden van T-001 staan nog niet in git (ongewijzigd uit ronde 1)
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** beide horen bij T-001, maar komen nu mee met T-002.
- **Voorstel:** vermeld in de commit van het savepoint dat ze bij T-001 horen.

## Gecontroleerd zonder bevinding
- **Crit. 1:** er is één `nav` met een naam uit `nl.json`, met vier links in de juiste volgorde. `aria-current` komt van `NavLink`, met `end` op `/`. De balk ligt onderaan, ook na scrollen op een lijst van 40 recepten; de test controleert ook dat de pagina echt scrollbaar is. De balk bedekt geen inhoud. Tikken op een link opent het juiste scherm. De TODO voor T-003 staat in de test.
- **Crit. 2:** de tokens staan in `tokens.css`. De scanner draait per bronbestand en heeft negatieve controles. `theme-color` en de manifestkleuren zijn gelijk aan de tokens. De lettertypen worden zelf gehost; `woff2` staat in de precache.
- **Crit. 3:** de contrastfunctie heeft unit tests met bekende waarden en weigert alfa. `readTokens` slaat de `:root` binnen `@media` over, dus de duur-tokens met `0ms` overschrijven niets. De focuskleur haalt minstens 3 : 1.
- **Crit. 4 en 5:** labels via `el.labels`, een Tab-rondgang met negatieve controle, een globale regel voor verminderde beweging en een tegenproef per route.
- **Crit. 6:** `ListState` heeft een laadtoestand (`role="status"`) en een lege toestand. De laadtest houdt het verzoek tegen. Bij een mislukt verzoek blijft er geen laadindicator staan. De laadtoestand van Favorieten volgt in T-017.
