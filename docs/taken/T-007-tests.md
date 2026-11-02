# T-007 — Tests (R-013)

Nieuwe/gewijzigde bestanden: `tests/unit/recipe.test.ts`, `tests/db/recipe-servings.test.ts`, `tests/e2e/recipe-servings.spec.ts`, `tests/helpers/supabase-admin.ts` (`validRecipe` heeft `servings: 4`, dus ook `insertRecipe`), `tests/helpers/recipe-form.ts` (`servingsField`, `fillRecipe` vult "Porties", standaard `4`).

`npx tsc --noEmit`: faalt alleen op de ontbrekende exports `parseServings`, `scaleQuantity` en `ingredientLine` in `src/lib/recipe.ts` (de ontwikkelaar maakt ze).

## Gedekt
- Crit. 1: unit (`parseServings`, `validateRecipe`, `toRow`, `draftFromRecord`, `pruneDraft`, `isDirty`), databank (verplicht, bereik, typefout `22P02`, grenzen 1 en 99, update door auteur, andere gebruiker krijgt 0 rijen), interface (meldingen, `aria-invalid`, `aria-describedby`, `inputmode`, geen POST, opslaan met 4, bewerken en weggooien-vraag).
- Crit. 2: stappen van 1, grenzen 1 en 99 (`disabled`), geen schrijfverzoek, waarde in de databank blijft 4, knoppen ≥ 44 px, `aria-live`, geen horizontale overflow op 360 px.
- Crit. 3: unit voor alle genoemde voorbeelden en randgevallen, plus de interface-reeks 4 → 6 → 1 (bloem, ei, melk).
- Crit. 4: unit (`ingredientLine`) en interface ("zout" blijft).
- Crit. 5: weggaan en terug, herladen, wisselen naar een ander recept in dezelfde route-component.
- Oude rij zonder porties: geen regelaar, hoeveelheden zichtbaar.

## Niet of deels gedekt
- Een toegankelijke naam uit `nl.json` voor de knoppen wordt gecontroleerd doordat de tests ze via `nl['servings.*']` zoeken; de aparte i18n- en tokenscanners-tests bestaan al.
- "Terugknop van de browser" (crit. 5): gedekt via `goBack` naar het recept. De variant "vooruit" is niet getest.
- Het formaat van het resultaat van `parseServings` (`{ ok, value }` / `{ ok: false, reason }`) is afgeleid uit `parseMinutes`; afwijkende vorm laat de unit-test falen.
- De uitkomst "< 0,01" wordt via `ingredientLine` getest; waar `scaleQuantity` zelf 0 teruggeeft is niet vastgelegd (brief laat dat open).
- De test van het oude rij gebruikt de service-sleutel om `servings` op `null` te zetten; dat werkt alleen als de checks `not valid` zijn zoals gepland, maar `not valid` checks worden bij een update alsnog gecontroleerd op de bijgewerkte rij, dus die test kan falen (check `recipes_servings_required`). Dan moet de ontwikkelaar of de eigenaar bepalen hoe een oude rij gesimuleerd wordt (bv. de check tijdelijk laten vallen in de test).

## Herstel (tester)
- crit. 5: wacht op overzichtskop (h1 "Recepten") voor `goBack`, en controleert daarna de detail-URL.
- Oude rijen: `servings = null` via een SQL-transactie (checks droppen, null zetten, opnieuw `not valid` toevoegen), want `not valid` checks gelden wel voor nieuwe updates.
- `tsc --noEmit` schoon; Playwright niet gedraaid (geen toestemming in deze sessie).
