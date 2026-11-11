# T-030 — Review (R-029)

Bekeken: `git diff HEAD` (niet-gecommitte wijzigingen) plus `docs/taken/T-030.md` en `T-030-tests.md`. `VRAGEN.md` heeft geen blok voor T-030.

## Kernbeslissingen
- `CLAUDE.md` is niet gewijzigd.
- Taal: de interface staat in nl en fr met dezelfde drie nieuwe sleutels. Code en commentaar zijn Engels. In orde.
- Mobiel eerst, tikdoelen en tokens: het veld, de range en de knop zijn elk ≥ 44 px (`--tap-min`), en een test in nl en fr dekt dat. De stijl gebruikt tokens. `4px` bij de rand volgt het bestaande patroon in `base.css`.
- Er is geen schemawijziging en geen migratie nodig: het filter blijft een `lte` op rijen die RLS al gefilterd heeft.

## Acceptatiecriteria
Elk criterium heeft een e2e-test of een unit-test die faalt als het gedrag ontbreekt:
- 1: schuiven naar 45 vult het veld, en 90 typen zet de range op 90.
- 2: `min`/`max`/`step`, 4320 → range 240, `432` + `1` geweigerd, 37/38, `clampToSlider`.
- 3: placeholder en `aria-valuetext` in nl en fr; de knop staat er alleen bij een actief filter en laat `totaal` staan.
- 4: grenswaarden 0, 45/46 en 120/121; `lte(…, 0)`.
- 5: `parseTypedMinutes`, plus geweigerde toetsaanslagen en volledige invoer.
- 6: een rij zonder tijden valt weg bij 4320.
- 7: URL, oude keuzes, `abc`, round trip.
- 8: favorieten met zoekterm, teller, "Alles wissen".
- 9: label boven het veld, uitlijning, slider-rol, ≥ 44 px, `scrollWidth`, `ArrowLeft`/`Home`.
- 10: sleutellijst.

De bestaande specs zijn correct omgezet van `selectOption` naar `setTimeLimit`.

## Bevindingen

### 1. `src/components/TimeFilter.tsx:85` — laag — ontwikkelaar
**Probleem:** crit. 1 zegt "beide staan altijd op dezelfde waarde". Bij een getypte waarde die geen veelvoud van 5 is (bv. 37), toont de range 35. De ontwikkelaar heeft dat bewust gekozen en het staat in `docs/beslissingen.md`. `aria-valuetext` geeft wel 37, dus schermlezers krijgen de echte waarde. Met stap 5 en vrije invoer valt het niet anders op te lossen.
**Voorstel:** zo laten. Vermeld het eventueel bij de eigenaar als interpretatie van crit. 1, naast de bestaande notitie in `beslissingen.md`.

### 2. `src/components/TimeFilter.tsx:42-47` — laag — ontwikkelaar
**Probleem:** voorloopnullen worden per toetsaanslag geweigerd. Staat er `0` in het veld en typt de gebruiker er `5` achter, dan gebeurt er niets (`05` is ongeldig). De gebruiker moet eerst wissen. Dat klopt met de afgesproken strikte regel, maar het voelt op een gsm aan als een veld dat niet reageert.
**Voorstel:** optioneel, alleen in het veld: `0` gevolgd door een cijfer normaliseren naar dat cijfer voordat `parseTypedMinutes` loopt. De URL-regel blijft strikt. Geen blokkade.

### 3. `src/i18n/nl.json:127`, `src/i18n/fr.json:127` — laag — tester
**Probleem:** `filter.all` wordt niet meer gebruikt, maar blijft staan omdat een i18n-test hem nog zou eisen (`docs/beslissingen.md`). `T-030-tests.md` zegt het omgekeerde: geen test eist de sleutel. Die twee notities spreken elkaar tegen. Er blijft dode tekst achter.
**Voorstel:** de tester kijkt na welke test `filter.all` vasthoudt. Is er geen, dan schrapt de ontwikkelaar de sleutel in beide bestanden in een volgende taak.

### 4. `tests/e2e/recipe-times.spec.ts` (crit. 2) — laag — tester
**Probleem:** `4321` in één keer plakken of `fill('4321')` in een leeg veld is niet getest. Alleen het typen cijfer per cijfer (`432` + `1`) is gedekt. De code weigert het geplakte geval wel, want `handleText` geeft dan `invalid`.
**Voorstel:** voeg `fill('4321')` toe aan de lus in de crit. 5-test (`['30,5', '30.5', '-30', '30a', '4321']`). Verwacht: het veld blijft `30`.

## Scope
Buiten de taak zijn alleen `PROGRESS.md` (`[~]`), `docs/loop-log.md` en `docs/beslissingen.md` gewijzigd. Dat is administratie van de loop en hoort erbij. Er is geen extra functionaliteit bijgekomen.
