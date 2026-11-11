# T-030 — Tests (R-029)

## Gedekt
- **Crit. 1** (e2e, `recipe-times.spec.ts`): schuiven → veld, typen → range, één range + één numeriek veld per grens.
- **Crit. 2** (e2e + unit `timeFilter.test.ts`): min/max/step, 4320, 432+`1` geweigerd, 37 blijft 37 en filtert (37 ja, 38 nee), `clampToSlider`.
- **Crit. 3** (e2e nl + fr): leeg veld, placeholder, `aria-valuetext`, range 240, knop alleen bij actief filter; "Geen limiet" houdt `totaal`.
- **Crit. 4** (e2e + unit): prep 0/45/46 en totaal 0/120/121 via URL en typen; `applyTimeFilter` met `maxPrep: 0`.
- **Crit. 5** (e2e + unit): `parseTypedMinutes`; ongeldig per toetsaanslag (`a`, `-`, `.`, `,`) en per volledige invoer (`30,5`, `30.5`, `-30`, `30a`); leegmaken zet filter uit, range 240.
- **Crit. 6** (e2e): recept zonder tijden verdwijnt met `prep=4320` en `totaal=4320`.
- **Crit. 7** (unit + e2e): `parseTimeFilter` (oude keuzes, 0, 7, 4320, ongeldig), round trip `toSearchParams`; `/?prep=60&totaal=120`, `/?prep=abc`.
- **Crit. 8** (unit `overviewFilters.test.ts` + e2e): teller `prep=7` → 1, `prep=0&totaal=4320` → 2, `prep=abc` → 0, `clearFilters`; `/favorieten` met zoekterm + `prep=37` toont "Filters (2)"; "Alles wissen" (ook in `overview-filters.spec.ts`).
- **Crit. 9** (e2e nl + fr): label boven veld, uitlijning/volle breedte, slider-rol met naam, ≥ 44 px voor veld, range en knop, `scrollWidth ≤ 360`; ArrowLeft → 235, Home → 0.
- **Crit. 10**: sleutels `filter.noLimit`, `filter.maxPrepSlider`, `filter.maxTotalSlider` toegevoegd aan de sleutellijst in `overviewFilters.test.ts` (aanwezig in nl en fr).
- Bestaande specs omgezet van `selectOption` naar `setTimeLimit`/`noLimitButton`/`timeField`: `recipe-equipment`, `recipe-search-synonyms`, `recipe-search`, `overview-filters`, `recipe-times`. De oude layouttest voor de selects is vervangen door crit. 9.
- Helpers in `tests/helpers/overview.ts`: `timeField`, `timeRange`, `timeBlock`, `noLimitButton`, `setTimeLimit`.

## Niet gedekt / opmerkingen
- `filter.all` schrappen: er is geen test die de sleutel nog eist (controle op `RETIRED_LANG`-lijsten niet nodig gebleken). De bouwer mag ze schrappen.
- Plakken van "4321" in een leeg veld (risico in brief) heeft geen aparte test.
- Visuele duim/spoor-stijl niet getest.

## Afhankelijkheden van de code (testnaad)
- `src/lib/timeFilter.ts` moet exporteren: `SLIDER_MAX`, `SLIDER_STEP`, `TIME_MAX_MINUTES`, `clampToSlider`, `parseTypedMinutes`. `tsc` faalt daar nu op (verwacht).
- Het blok per tijdgrens moet de klasse `.time-limit` hebben (helper `timeBlock` leunt erop); het tekstveld heeft een `id` met `<label for>`.
- Ongeldige invoer wordt per `input`-event teruggezet op de laatste geldige tekst.

## Niet uitgevoerd
- In deze sessie kon ik `npx playwright test --list` en `npx vitest run` niet draaien (opdracht vereiste goedkeuring). Wel gedraaid: `npx tsc --noEmit`; enige fouten zijn de ontbrekende exports hierboven, geen fouten in de e2e-bestanden.
