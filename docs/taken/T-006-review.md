# T-006 — review

Bekeken: `git diff` tegen `9e18f37` plus de nieuwe bestanden (migratie `20261102130000_recipe_times.sql`, `timeFilter.ts`, `TimeFilter.tsx`, `tests/db/recipe-times.test.ts`, `tests/e2e/recipe-times.spec.ts`, `tests/unit/timeFilter.test.ts`).

`CLAUDE.md` is niet gewijzigd. Er wordt geen kernbeslissing geschonden:
- rechten en validatie zitten in de databank (checks plus kolomrecht, de update-policy is ongewijzigd);
- alle zichtbare teksten staan in `nl.json`;
- de stijl gebruikt alleen tokens;
- er komt geen sleutel in de client.

Elk acceptatiecriterium van R-007 heeft een test die echt faalt als het gedrag ontbreekt:
- crit. 1: unit-, databank- en e2e-tests;
- crit. 2: unit, databank (ook een update van één kolom) en e2e (letterlijke melding, focus);
- crit. 3: unit plus e2e op de detailpagina en in het overzicht;
- crit. 4: e2e met 30/60, 31/61 en 15/120. De grenswaarde telt mee en +1 minuut niet. De filters werken samen met "en", en "Alle" zet ze terug.

## Bevindingen

### 1. Commentaar bij de sorteercontrole klopt niet
- **Bestand:** `tests/e2e/recipe-times.spec.ts:204`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** het commentaar zegt "with prep <= 120 all three match", maar de test gebruikt `/?prep=30`, waardoor B wegvalt. De controle zelf (C vóór A) is correct. Alleen de uitleg misleidt.
- **Voorstel:** maak er "with prep <= 30, A and C match; C was inserted last" van.

### 2. Scheidingsteken en woordvolgorde van de tijdregel staan in JSX
- **Bestand:** `src/pages/RecipeListPage.tsx:480`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** het scheidingsteken " · " en de volgorde "label tijd" staan vast in JSX. Een zichtbaar teken staat daardoor buiten `nl.json`.
- **Voorstel:** gebruik een sleutel, bijvoorbeeld `"time.line": "Preptijd {prep} · Totale tijd {total}"`.

### 3. Volgnummer per verzoek is niet getest
- **Bestand:** `src/pages/RecipeListPage.tsx:428-437`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** het volgnummer per verzoek is niet getest. `T-006-tests.md` vermeldt dat wel. Een Playwright-route kan het eerste GET-verzoek vertragen (`route.fulfill` na een wachttijd), en dan valt dit deterministisch te testen.
- **Voorstel:** voeg een test toe:
  - vertraag het antwoord voor `prep_minutes=lte.15`;
  - kies daarna meteen "30 min";
  - controleer dat na het late antwoord de lijst van 30 blijft staan.

### 4. Bestanden buiten de taak
- **Bestanden:** `README.md` en `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** beide bestanden zijn nieuw en staan niet in het plan van T-006. Ze horen niet bij R-007.
- **Voorstel:** laat ze buiten de commit van T-006, of geef ze een eigen taak.
