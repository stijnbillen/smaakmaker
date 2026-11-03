# T-015 — tests (R-009 Zoeken op ingrediënten)

Bestanden: `tests/db/recipe-search.test.ts`, `tests/unit/ingredientSearch.test.ts`, `tests/e2e/recipe-search.spec.ts`.
`npx tsc --noEmit`: enige fout is de ontbrekende module `src/lib/ingredientSearch` (testnaad, door de ontwikkelaar te maken).
Alle tests mogen falen tot de ontwikkelaar klaar is (BestaandTotTaak = 0).

## Testnaad voor de ontwikkelaar
- `src/lib/ingredientSearch.ts` exporteert `MAX_TERMS`, `SEARCH_DEBOUNCE_MS`, `parseTerms`, `clampMin`, `parseSearch` (`{ with, without, min }`), `toSearchParams(search, base)`, `hasSearch` en **`createDebouncer(fn, ms)`**: een pure functie die een aanroepbare functie met `.cancel()` teruggeeft. Er is geen DOM-testbibliotheek (`@testing-library`) geïnstalleerd, dus de debounce moet los van React testbaar zijn; de hook `useDebounced` mag erop leunen.
- `parseTerms` mag een array geven of `{ terms, tooMany }`.
- Ontbrekende interface-hooks die de e2e-tests nodig hebben: labels uit `nl.json` (`search.with`, `search.without`, `search.min`, `search.submit`), `role="search"`, `enterkeyhint="search"`, `aria-describedby` op het "Met"-veld naar `search.tooMany`, `data-testid="recipe-matches"` met tekst uit `search.matches`, titel in `.recipe-title` (bestaand). De optie-teksten van "Minstens" zijn `1..n`, met `search.minAll` voor de laatste (n).

## Gedekt
- Crit. 1: db (substring, `fetakaas`/`Feta`, accent/hoofdletter, alleen ingrediëntnaam, `%` en `_` als gewone tekst), e2e (typen → twee feta-recepten).
- Crit. 2: unit (parseTerms, ontdubbelen, 11 termen, clampMin); db (match_count 1 bij dubbele treffer, standaard k = n, k = 1, 11 termen en k buiten 1..n → 22023, gelijke termen tellen één keer); e2e (keuzelijst vanaf 2 termen, 1..n, "alle" schuift mee, 3 blijft 3, melding bij 11).
- Crit. 3: db en e2e (feta+tomaat+ui, k = 3, exact twee resultaten). Termen dragen een unieke suffix, dus de "ui"/"fruit"-valkuil speelt niet.
- Crit. 4: db (zonder, accentongevoelig, 11 → 22023, alleen zonder zonder `match_count`); e2e (zonder verwijdert, alleen zonder).
- Crit. 5: db (5,3,3,2, nieuwste eerst); e2e ("k van n" per resultaat, volgorde, geen label zonder termen).
- Crit. 6: e2e (Niets gevonden, leegmaken wist URL-parameters).
- Crit. 7: unit (300 ms ≤ 400, één aanroep met laatste waarde, cancel); e2e (`page.clock`, knop, Enter, laat antwoord via `page.route`).
- Crit. 8: e2e (alle filters samen, elk paar apart, URL/herladen, filter wijzigen wist zoektermen niet); db (`lte`, `overlaps`, `order` op de rpc, `id` aanwezig).
- Crit. 9: unit (parseTerms), db (lege elementen, term `a`), e2e (alleen spaties).
- Overig: i18n-sleutels (unit), anonieme aanroep geweigerd (db), zichtbare labels, tikdoelen ≥ 44 px, geen horizontaal scrollen op 360 px, verbindingsfout met banner en behouden invoer (e2e).

## Niet gedekt
- Favorietenfilter (crit. 8): favorieten bestaan nog niet; hoort bij R-014.
- Omgekeerd "zoektermen wijzigen wist filters niet": gedekt met `prep`; niet voor elk filter apart.
- "Alleen tokens in de stijl": de bestaande `no-hardcoded-styles`-test scant `src/styles` al, geen nieuwe test.
- Lay-outcontrole met zoekparameters in `tests/e2e/routes.ts`: niet toegevoegd (variant in eigen spec gedekt).
- Anonieme aanroep: geaccepteerd als weigering `42501` of 0 rijen; een andere foutcode zou falen.

## Herstel (ontwikkelaar-melding)
- `quantity` is nu een getal (`1`), zoals `recipes_ingredients_valid` eist.
- Review bevinding 1 (crit. 7): klok nu bevroren (`install({ time: 0 })` + `pauseAt(1000)`). Debounce-grens getest met `runFor(299)` (geen `met=`) en `runFor(101)` (wel). Knop en Enter getest zonder `runFor`: URL verandert alleen door de knop/Enter. Niet gedraaid tegen lokale Supabase.
- Suffix `s` wordt per test vernieuwd (`beforeEach`), zodat recepten van eerdere tests de resultaten van crit. 4, 5 en 8 niet vervuilen. Verwacht gedrag onveranderd.
