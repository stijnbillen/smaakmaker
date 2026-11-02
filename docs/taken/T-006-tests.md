# T-006 — tests

`npx tsc --noEmit` faalt alleen op ontbrekende productie-exports (verwacht tot de ontwikkelaar klaar is):
`formatDuration` (`src/lib/format.ts`), `parseMinutes` (`src/lib/recipe.ts`), `src/lib/timeFilter.ts`.

## Gedekt

| Criterium | Test |
|---|---|
| 1 parseMinutes + validateRecipe | `tests/unit/recipe.test.ts` (parseMinutes, validateRecipe: times, pruneDraft/toRow/draftFromRecord, isDirty) |
| 1 databank (verplicht, grenzen, typefout, update, 0/0 en 4320/4320) | `tests/db/recipe-times.test.ts` |
| 1 interface (leeg, 4321, abc, aria, inputmode, geen POST) | `tests/e2e/recipe-times.spec.ts` |
| 2 vergelijking unit / db / interface (letterlijke melding, focus, 30/30 ok) | idem |
| 3 formatDuration (7 waarden) | `tests/unit/format.test.ts` |
| 3 weergave detail + overzicht | `tests/e2e/recipe-times.spec.ts` |
| 4 parseTimeFilter | `tests/unit/timeFilter.test.ts` |
| 4 filter, "en", "Alle", URL, herladen, terugknop, sortering, "Niets gevonden.", label/44 px/360 px | e2e |
| Bewerken toont tijden, dirty-vraag; banner + "Opnieuw proberen" met zelfde filter | e2e |
| Bestaande tests | `validRecipe` (prep 10 / totaal 20) en `fillRecipe` (standaard '10'/'20') vullen de tijden, dus `recipe-form`, `discard`, `connection` e.a. blijven werken |

## Aannames over vorm (brief legt niet vast)

- `parseMinutes` geeft `{ok, value}` (of een getal / `error`); lees-tolerant, net als `parseQuantity`.
- `validateRecipe`: veldfouten onder `errors.prepMinutes` / `errors.totalMinutes`, waarde `totalBeforePrep` voor vergelijking.
- `toRow` geeft `prep_minutes` / `total_minutes` als getal.
- `parseTimeFilter(URLSearchParams)` → `{ maxPrep, maxTotal }`; parameters `prep` en `totaal`.
- Labels via `nl['form.prepMinutes']`, `nl['form.totalMinutes']`, `nl['filter.maxPrep']`, `nl['filter.maxTotal']`, `nl['filter.all']`; filterkeuzes als "15 min", "30 min", "1 u", "2 u".
- Filter-request bevat `prep_minutes=lte.30` (PostgREST `.lte`).

## Niet gedekt

- Snel wisselende filters (volgnummer per verzoek): niet deterministisch te testen zonder routes te vertragen; laat staan.
- Oude rijen zonder tijden (nullable, `not valid` check): vraagt een rij invoegen vóór de migratie; niet haalbaar in de testopzet.
- Afbreken van de tijdregel in overzicht op 360 px: alleen de algemene overflowcontrole bij de filters.
- Database-fout `22P02` voor "abc"/1.5: test eist alleen een fout (code is versie-afhankelijk, zoals de brief zegt).

## Herstel na melding ontwikkelaar

In `recipe-times.spec.ts`: sorteertest wacht nu op zichtbare items A en C vóór `allInnerTexts()`; banner-test wacht op zichtbaar en enabled filter vóór de route-abort. Te toetsen gedrag ongewijzigd.

Productiecode niet gewijzigd; geen testnaad nodig.
