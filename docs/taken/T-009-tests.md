# T-009 — tests (R-008 Kookgerief)

`npx tsc --noEmit`: enige fouten zijn de ontbrekende modules `src/lib/equipment.ts` en `src/lib/equipmentFilter.ts` (testnaad voor de ontwikkelaar).

## Bestanden
- `tests/unit/equipment.test.ts` — crit. 1 en 2 (unit), plus `validateRecipe`/`toRow`/`draftFromRecord`/`emptyDraft`/`pruneDraft`/`isDirty` voor `equipment`. Staan hier en niet in `recipe.test.ts`, om dat bestand niet te laten groeien.
- `tests/unit/equipmentFilter.test.ts` — crit. 4 (unit).
- `tests/db/recipe-equipment.test.ts` — crit. 1, 2 en 4 (databank), rechten, catalogus, `equipment_in_use`.
- `tests/e2e/recipe-equipment.spec.ts` — crit. 1–4 (interface, 360 × 640).
- `tests/helpers/recipe-form.ts` — `equipment` in `RecipeInput`, plus `equipmentGroup`, `equipmentChoice`, `equipmentNewField`, `equipmentAddButton`.

## Aannames over de API (brief legt vorm niet vast)
- `parseEquipmentFilter(params)` geeft `string[]`; `toSearchParams(names, base?)`; `hasEquipmentFilter(names)`; `applyEquipmentFilter(query, names)`.
- `validateEquipmentName` mag string, boolean, `{ok}`, `{valid}` of `{error}` geven (tolerant gelezen).
- `addEquipment(selected, catalog, input)` en `toggleEquipment(selected, name)` geven een `string[]`.
- `validateRecipe(...).errors.equipment === 'equipmentTooMany'`.
- `equipment_in_use` geeft strings of objecten met `name`.
- Formulier: `fieldset`/legend `form.equipment`; filter: groep met naam `filter.equipment`; knoppen met `aria-pressed`.
- `data-tap-target` wordt alleen op aanwezigheid gecontroleerd.

## Gedekt
- Crit. 1: alle bullets (unit, databank, interface). Databank: leeg/spaties/31 → 23514, 20/21, trimmen, ontdubbelen, update-validatie, auteur mag wijzigen, ander en beheerder 0 rijen, catalogus leesbaar/anon niet/schrijven → 42501.
- Crit. 2: `equipmentKey`, `addEquipment`, `fold_key`, hergebruik tussen gebruikers, gelijktijdig "Wok"/"wok", knoppen (toggle, 44 px), "OVEN" hergebruikt "Oven", ander gebruiker ziet nieuw item in formulier en filter.
- Crit. 3: detail, overzicht, geen kop/leeg element zonder gerief, geen horizontaal scrollen met 30 tekens zonder spatie en 20 items.
- Crit. 4: unit (parse/toSearchParams/apply met nep-builder), databank (`overlaps`), interface (geen keuze, één, twee, URL + herladen, doorsnede met tijdfilter, "Niets gevonden.", onbekende naam).
- Extra: Enter in het veld verstuurt het formulier niet.

## Niet gedekt
- i18n-test en `no-hardcoded-styles`: bestaande scanners dekken `nl.json` en CSS vanzelf.
- Bestaande tikdoeltest via `tests/e2e/routes.ts`: bestaand, niet aangepast.
- "Kookgerief" in "Wijzigingen weggooien?" bij 'item toevoegen' en 'weghalen': beide gedekt; 'catalogus-fout via report/resolve' (verbindingsfout in de picker) niet, brief noemt er geen criterium voor.
- "Een recept van 20 items" op detail in de variant (R-006): valt onder die taak.
- Onbekend: tests zijn niet gedraaid tegen Supabase/Playwright (code bestaat nog niet).
