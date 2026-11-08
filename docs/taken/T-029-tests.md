# T-029 — Testverslag (tester)

## Nieuwe en aangepaste bestanden
- `tests/unit/recipeSort.test.ts` (nieuw): crit. 9, 10, 11, 12, 13, 14, 15.
- `tests/unit/overviewFilters.test.ts` (nieuw): crit. 3 (teller), 4 (`clearFilters`), 16 (sleutels en `{n}`).
- `tests/e2e/overview-filters.spec.ts` (nieuw): crit. 1–9, 10–12, 14, 15 in nl en fr waar taalafhankelijk.
- `tests/helpers/overview.ts` (nieuw): `openFilters`, `closeFilters`, `filtersButton`, `filtersPanel`, `sortSelect`, `directionButton`, `autoOpenFilters`.
- `tests/unit/reviews.test.ts`: sorteertests verhuisd naar `recipeSort.test.ts`; verwachte tekst `overview.sortRating` = "Aantal sterren"; `overview.sortNewest` vervalt.
- `tests/e2e/reviews.spec.ts`: `sortNewest` → `sortCreated`.
- Negen bestaande e2e-specs (bilingual-data, favorites, recipe-equipment, recipe-search, recipe-search-synonyms, recipe-tags, recipe-trait-tags, recipe-times, variants) roepen `autoOpenFilters(page)` aan in een `beforeEach`. Die helper wikkelt `page.goto`/`page.reload` zodat het filterpaneel opent na elk bezoek aan `/` of `/favorieten`. Verwachtingen zijn niet gewijzigd. Pagina's uit `browser.newContext()` worden niet gewikkeld; als zo'n test een filterveld gebruikt, moet die zelf `openFilters` aanroepen.

## Gedekt
Crit. 1, 2, 3, 4, 5 (combinatietest op `/favorieten`; de bestaande tests via `autoOpenFilters`), 6, 7, 8, 9, 10, 11 (volgorde in nl en fr), 12, 13 (unit), 14, 15, 16.

## Niet of deels gedekt
- **Crit. 11, taalwissel zonder nieuw verzoek:** niet als e2e. De taalknop staat alleen op profiel en inlogscherm; wisselen hermonteert de lijst, dus "geen nieuw verzoek" is daar niet te meten. De locale-afhandeling zit in de unit-test (`nl-BE` en `fr-BE`). Wil de eigenaar dit wel e2e, dan is een testnaad nodig (taalwissel op het overzicht).
- **Crit. 5:** de bestaande specs zijn niet inhoudelijk herlezen op elke `goto` naar `/` binnen helpers die een URL met `page.goto(url)` opbouwen. De wrapper vangt alle `page.goto` van de hoofdpagina.
- **Crit. 6:** het veld "Minstens" verschijnt alleen bij minstens twee ingrediënten; de test gebruikt daarom `?met=feta&met=tomaat`. Neem de "binnenbreedte van het paneel" als clientbreedte min padding en rand van `#overview-filters`.
- **Selectors afhankelijk van de implementatie (testnaden):** paneel `#overview-filters` en werkbalk `.overview-toolbar` (staan in het plan), knop `aria-controls="overview-filters"`, chips met klasse `.choice` (bestaande klasse van `TagChoices`/`EquipmentChoices`, niet nagelezen), tag-knoppen met `aria-pressed`, richtingsknop met toegankelijke naam gelijk aan `overview.sortAsc` of `overview.sortDesc`. Optiewaarde van het sorteerveld in bestaande test blijft `rating` (`SortField`).
- Crit. 12 e2e leegt de tijden via SQL in één transactie die de `not valid`-checks even laat vallen en opnieuw toevoegt (precedent: `recipe-servings.spec.ts`).

## Uitgevoerd
- `npx tsc --noEmit`: enige fouten zijn de ontbrekende modules `src/lib/recipeSort` en `src/lib/overviewFilters` (testnaad; de ontwikkelaar maakt ze) en daaruit volgende `implicit any` in `recipeSort.test.ts`.
- `npx vitest run` en `npx playwright test --list` kon ik niet draaien: de sandbox vroeg om goedkeuring, en de modules bestaan nog niet. De tests moeten falen tot de ontwikkelaar klaar is (nieuwe taak, `BestaandTotTaak` = 0).

## Herstel na melding ontwikkelaar
- `tests/unit/i18n.test.ts` (snapshot nl vóór T-018): `overview.sortNewest` (vervallen) en `overview.sortRating` (nu "Aantal sterren") staan als bewuste T-029-wijziging in een expliciete uitzonderingslijst `CHANGED_BY_T029`. Alle andere sleutels moeten ongewijzigd blijven. Het getoetste gedrag (R-023 crit. 8) is niet versoepeld.
- `createTestUser` ("Database error creating new user"): `tests/helpers/supabase-admin.ts` is in git ongewijzigd en klopt met de migraties (trigger `handle_user_created` eist een geldige uitnodiging in `user_metadata.invite_code`; de helper maakt die eerst aan). Geen enkele migratie is gewijzigd. De fout komt dus uit de lokale omgeving (waarschijnlijk een achterhaalde of half gemigreerde lokale databank). Ik kon `supabase`-commando's niet draaien (sandbox vroeg om goedkeuring), dus niet bevestigd. Voorstel: `supabase db reset` en de e2e opnieuw draaien.

## Eisen aan de implementatie die uit de tests volgen
- Exports `recipeSort.ts`: `DEFAULT_SORT`, `defaultDirection`, `changeField`, `parseSort`, `toSearchParams`, `sortRecipes(rows, sort, locale)`, types `SortField` (`created|rating|title|total|prep`), `SortDirection` (`asc|desc`), `RecipeSort`.
- Exports `overviewFilters.ts`: `activeFilterCount`, `clearFilters`.
- Rijen voor `sortRecipes`: `id`, `title`, `created_at`, `rating_avg`, `rating_count`, `prep_minutes`, `total_minutes`, optioneel `matchCount`.

## Herstelronde 2 (tests opnieuw opgebouwd)
- De werkmap bevatte de T-029-tests niet meer; `git stash apply` en `git apply` worden geweigerd. `git stash show -p stash@{2}` werkte wel, maar toont geen ongetrackte bestanden. Daarom zijn de ongetrackte bestanden opnieuw geschreven en de getrackte wijzigingen met de hand teruggezet:
  - nieuw: `tests/helpers/overview.ts`, `tests/unit/recipeSort.test.ts`, `tests/unit/overviewFilters.test.ts`, `tests/e2e/overview-filters.spec.ts`;
  - aangepast: de negen e2e-specs (`autoOpenFilters` in `beforeEach`), `reviews.spec.ts` (`sortCreated`), `reviews.test.ts` (sorteertests weg, "Aantal sterren"), `i18n.test.ts` (uitzondering voor `overview.sortNewest` en `overview.sortRating`, naast die van T-027).
- Gevraagde `openFilters` voor pagina's uit `newContext()`/`newPage()`: toegevoegd in `bilingual-data.spec.ts` (nlPage), `recipe-equipment.spec.ts` (p2) en in de `open()`-helper van `recipe-search-synonyms.spec.ts`.
- `openFilters` is idempotent (opent alleen als `aria-expanded` niet `true` is).
- Uitgevoerd: `npx tsc --noEmit` geeft alleen de ontbrekende modules `recipeSort` en `overviewFilters` (testnaad voor de ontwikkelaar) en de `implicit any` die daaruit volgt. `vitest` en `playwright --list` werden niet toegestaan; die zijn dus niet gedraaid.
- Testnamen en e2e-specs zijn opnieuw geschreven; de dekking is die van de lijst hierboven (crit. 11 taalwissel zonder verzoek blijft niet als e2e gedekt). Extra aanname: optie-waarde `rating` van het sorteerveld blijft bestaan (bestaande test in `recipe-search.spec.ts`).

## Herstelronde (blokkade, vorige poging)
- Gevraagd: `openFilters` toevoegen in bilingual-data.spec.ts:133, recipe-equipment.spec.ts:157, recipe-search-synonyms.spec.ts:171 (pagina uit newContext/newPage).
- Niet uitgevoerd: de werkmap bevat `tests/helpers/overview.ts`, `tests/e2e/overview-filters.spec.ts`, `tests/unit/recipeSort.test.ts` en de `autoOpenFilters`-aanroepen niet. Ze staan alleen in `stash@{0}` ("T-029 niet geslaagd"); `git stash show/apply` werd geweigerd in deze sandbox.
- Nodig: stash terugzetten (`git stash apply`) en deze taak opnieuw starten, of toestemming voor git stash.
