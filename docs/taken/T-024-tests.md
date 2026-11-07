# T-024 — tests

Bestanden:
- `tests/db/recipe-search-synonyms.test.ts` (search_recipes met catalogus, search_term_info)
- `tests/unit/ingredientSearchSynonyms.test.ts` (`replaceTerm`, `dedupeByItem`)
- `tests/e2e/recipe-search-synonyms.spec.ts`

`npx tsc --noEmit`: enige fouten zijn de ontbrekende exports `dedupeByItem`, `replaceTerm`, `TermInfo` in `src/lib/ingredientSearch.ts` (testnaad, door de ontwikkelaar te maken).

## Aannames over de API (ontwikkelaar volgt dit)
- `TermInfo = { term: string; itemId: string | null; suggestion?: {id, name} }`.
- `dedupeByItem(terms: string[], info: TermInfo[])` → `{ terms: string[]; duplicates: string[] }`; `info` is een array, gekoppeld aan de term via `term`.
- `search_term_info` geeft kolommen `term, item_id, suggestion_id, suggestion_name`. "Niets geven" (xqzv, bro) mag als ontbrekende rij of als rij met alleen nulls.
- E2E: de knop "Bedoelde u" is een `button` met naam `search.didYouMean`; "Al toegevoegd." is zichtbare tekst `search.duplicate`. Taalkeuze via localStorage `smaakmaker.lang`.

## Gedekt
- Crit. 1 DB (a/b/c, tomate, pomme de terre/aardappel, tomatensaus-decoy) en E2E (nl + fr, "1 van 1"/"1 sur 1").
- Crit. 2 DB: feta/creme (vrije tekst), "pomme" via gekoppeld item. (De bestaande R-009-tests dekken de rest en blijven ongewijzigd.)
- Crit. 3 DB (search_term_info nl/fr, anon 42501, grens 20, taal), unit (`replaceTerm`), E2E (nl, fr, geen suggestie bij zout/xqzv, laatste invoer wint, Zonder-veld, 44 px, geen overflow).
- Crit. 4 DB en E2E (Zonder brocoli, deel van naam blijft uitsluiten).
- Crit. 5 DB (term_count/match_count 1, p_min 2 geen fout, p_min > n nog fout), unit (`dedupeByItem`), E2E (nl + fr).
- Crit. 6 DB (signatuur zonder taal) en E2E (tomate nl/fr, zelfde titels en volgorde).
- Crit. 7 DB (resultaatkolommen incl. `is_favorite`, `.lte`) en E2E (tijdfilter).

## Niet gedekt
- Crit. 7 E2E met favorieten: de favorietenlijst-interface is hier niet opnieuw uitgewerkt; de DB-test dekt `is_favorite` in het resultaat. Bestaande favorites-tests blijven gelden.
- Taalwissel zonder herladen met zichtbare suggestie (risico in brief): niet getest, taak laat de keuze aan de ontwikkelaar.
- Snelheid (risico) niet getest.

## Na review
- Crit. 7 E2E met favorieten toegevoegd (`/favorieten`, "brocoli", alleen het favoriete recept). Dit staat dus niet meer onder "Niet gedekt".
- Bevinding 3: URL-controles in crit. 3 en 5 gebruiken nu `expect.poll`.
- Bevinding 4 (taalwissel met zichtbare suggestie) blijft niet gedekt: de taalkeuze staat alleen op /profiel en /aanmelden, niet op het overzicht, dus de suggestie is niet zichtbaar tijdens de wissel.
