# T-010 — tests

`npx tsc --noEmit`: alleen `TS2307` voor `src/lib/tags` en `src/lib/tagFilter` (testnaad, door de ontwikkelaar te maken). Verder compileert alles.

De werkkopie was teruggezet (taak eerder geblokkeerd, werk in `stash@{0}`). De testbestanden zijn opnieuw aangemaakt op de huidige basis (inclusief T-009 kookgerief), met de eerdere review-herstellen.

## Bestanden
- Nieuw: `tests/unit/tags.test.ts`, `tests/unit/tagFilter.test.ts`, `tests/db/recipe-tags.test.ts`, `tests/e2e/recipe-tags.spec.ts`.
- Uitgebreid: `tests/unit/recipe.test.ts` (blok "dish tags in the draft"), `tests/helpers/recipe-form.ts` (`dishTags` in `RecipeInput`, `tagGroup`, `tagButton`, `newTagField`, `addTagButton`, `pickDishTags`).
- `newTagField` en `addTagButton` zijn beperkt tot de tag-groep (`tagGroup`), omdat de kookgerief-kiezer ook een knop "Toevoegen" heeft (anders een strict-mode-botsing in Playwright).
- `insertRecipe` geeft `dish_tags` al door via `overrides`; geen wijziging nodig.

## Aannames over de interface (door de ontwikkelaar te volgen)
- `tags.ts`: `addTag`/`toggleTag` geven een `string[]`; de catalogus is `string[]`. `validateTagName` mag boolean, `{ ok }`, `null` (geldig) of een foutcode teruggeven.
- `tagFilter.ts`: `parseTagFilter` geeft `{ dish: string[] }` (ook leeg: `{ dish: [] }`); `applyTagFilter` roept `overlaps('dish_tags', <gequote array-literal als string>)` aan.
- Interface: `TagPicker` is een `fieldset` met `legend` "Soort gerecht" (role `group`), met daarin de tagknoppen (`aria-pressed`, `data-tap-target`), het veld "Nieuwe tag" en de knop "Toevoegen"; de overzichtspagina heeft eenzelfde groep met dezelfde legend. Foutmelding hangt via `aria-describedby` aan het veld.
- Detail: `data-testid="recipe-dish-tags"`; zonder tags geen tekst "Soort gerecht".
- De 21e tag in het formulier toont `form.tagsTooMany`.
- Het tagfilter in het overzicht laadt via `/rest/v1/tags` (voor de gemockte layouttest).

## Gedekt
- Crit. 1: seed (databank: elke naam één keer, tweede seed-insert geen dubbels; e2e: acht knoppen in een nieuw formulier).
- Crit. 2: unit (validate, toRow, draftFromRecord, emptyDraft, isDirty), databank (default `[]`, opslaan, 20/21, ontdubbelen, auteur-update, andere gebruiker en beheerder 0 rijen), e2e (zonder tags, opslaan, detail, bewerken, weggooien-vraag, geen kop).
- Crit. 3: unit (validateTagName, tagKey, addTag), databank (fold_key, hergebruik tussen gebruikers, trimmen, 23514, gelijktijdig Brunch/brunch met unieke suffix per run), e2e (SOEP, 31 tekens/leeg met aria, Enter zonder POST, tag van andere gebruiker in formulier en filter).
- Crit. 4: unit (parse, toSearchParams, applyTagFilter met nep-builder incl. quoting), e2e (A/B/C, URL + herladen, doorsnede met totaaltijd, "Niets gevonden.", onbekende tag, komma en speciale tekens).
- Crit. 5: databank (insert/update/delete 42501 voor gebruiker en beheerder; anon geen lezen), e2e (geen verwijder/hernoem-knop, afvinken behoudt knop).
- Extra: tikdoelen ≥ 44 px + `data-tap-target`, 20 × 30 tekens zonder horizontaal scrollen (gemockte catalogus), lange label op detail.

## Review-herstel (tester)
- Bevinding 1 (laag): "Brunch"/"brunch" krijgt per run een unieke suffix, zodat de race echt getest wordt.
- Bevinding 2 (laag): databank- en e2e-test ruimen de eigen testtags op in `afterAll` via `sql` (op de suffixen van de run). Uitzondering: de vaste lange naam in de detail-layouttest.

## Niet gedekt
- Beheerder verwijdert ongebruikte tag: bewust niet gebouwd (geparkeerd).
- i18n-test en `no-hardcoded-styles`-scanner: bestaande generieke tests dekken de nieuwe sleutels/stijl.
- De databanktest "precies acht namen" is verzwakt tot "elke naam precies één keer": de catalogus is gedeeld en andere tests/runs voegen tags toe.
- "Bestaande tests blijven slagen": door de volledige suite bij oplevering.
