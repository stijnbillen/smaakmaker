# T-015 — tests (R-009 Zoeken op ingrediënten, tweede poging)

Bestanden: `tests/db/recipe-search.test.ts`, `tests/unit/ingredientSearch.test.ts`, `tests/e2e/recipe-search.spec.ts`.
Vanaf nul geschreven volgens de brief; de stash is niet gebruikt.
`npx tsc --noEmit`: enige fout is de ontbrekende module `src/lib/ingredientSearch` (testnaad, door de ontwikkelaar te maken).
Niet gedraaid: de functie, de pagina en de migratie bestaan nog niet. `BestaandTotTaak = 0`, dus falen mag tot de ontwikkelaar klaar is.

## Regels uit de brief, toegepast
- `quantity` is een getal.
- Elke test heeft een eigen letters-only suffix (`beforeEach`) in titel en ingrediëntnamen. Databanktests kijken bovendien alleen naar de eigen recept-id's; e2e-tests alleen naar de eigen titels.
- Geen nieuwe tags of kookgerief: alleen `soep`, `tapas`, `snel` en `Pan`. `snel` staat alleen in `trait_tags`.
- Opruimen per id (`recipes.delete().in('id', …)`, `deleteTestUser`).
- Klok in e2e bevroren: `clock.install({ time: now })`, `goto`, `pauseAt(now + 5 s)`. Pauze: `runFor(299)` geen `met=`, `runFor(101)` wel. Knop en Enter: geen `runFor`.

## Testnaad voor de ontwikkelaar
- `src/lib/ingredientSearch.ts` exporteert `MAX_TERMS`, `SEARCH_DEBOUNCE_MS`, `parseTerms`, `clampMin`, `parseSearch`, `toSearchParams`, `hasSearch`, `createDebouncer`.
- `parseTerms` mag een array (met eigenschap `tooMany`) of `{ terms, tooMany }` teruggeven; de test accepteert beide.
- `parseSearch` geeft `{ with, without, min }` (`min`: getal of `null`). `?met=Feta&met=feta&min=2` geeft `min === 1`. Een ontbrekende `min` mag `null` of n zijn.
- `toSearchParams(search, base)`: `base` is een `URLSearchParams`; `min` alleen bij k < n.
- `createDebouncer(fn, ms)` geeft een functie met `.cancel()`.
- Interface: labels uit `nl.json` (`search.with`, `search.without`, `search.min`, `search.submit`), `role="search"`, `aria-describedby` op het "Met"-veld naar het element met `search.tooMany`, `data-testid="recipe-matches"`, `.recipe-list > li` en `.recipe-title` (bestaand). Opties van "Minstens": `1..n-1` en voor n de tekst `search.minAll` met `{n}`.
- RPC-resultaat bevat `id`, `prep_minutes`, `equipment`, `created_at`, `photos`, `family_id`, `rating_avg`, `rating_count`, `author_name`, `match_count`, `term_count`.

## Gedekt
- Crit. 1: db (substring, `fetakaas`/`Feta`, `creme`/`CRÈME`, alleen ingrediëntnaam met titel/stap/eenheid/opmerking als lokaas, `%` en `_`); e2e (typen "feta").
- Crit. 2: unit (parseTerms, ontdubbelen, 11 termen, clampMin, parseSearch incl. `Feta`/`feta`/`min=2`); db (match_count 1, ontdubbelen, k = n standaard, k = 1, 11 termen en k buiten 1..n → `22023`, 10 termen mag); e2e (keuzelijst vanaf 2 termen, 1..n, "alle" schuift mee, 3 blijft 3, melding met `aria-describedby`, directe URL zonder `overview.error`).
- Crit. 3: db (3/2/5 termen, k = 3, `match_count` 5) en e2e (precies twee resultaten), met suffix op de termen tegen de "fruit"/"knoflook"-valkuil.
- Crit. 4: db (zonder, ook boven minimum, accenten, 11 → `22023`, alleen zonder met `match_count` 0); e2e (zonder verwijdert, alleen zonder zonder "k van n").
- Crit. 5: db (5, 3, 3, 2; jongste eerst); e2e ("k van n" per resultaat, volgorde, geen label zonder termen, sorteer-beoordeling met gelijke `match_count` en verschillende review plus recept zonder review onderaan).
- Crit. 6: e2e ("Niets gevonden.", leegmaken wist `met`/`zonder`/`min`).
- Crit. 7: unit (300 ≤ 400, één aanroep met laatste waarde, cancel); e2e (stilstaande klok 299/101, knop en Enter zonder `runFor`, late antwoorden met `page.route`).
- Crit. 8: e2e (zoeken + tijd, gerief, soort, kenmerk apart; alle filters + sortering samen; URL en herladen; filter wijzigen houdt termen en omgekeerd; hoofdfoto, label "Variant", beoordeling in zoekresultaten); db (`lte`, `overlaps`, `order` op de RPC, `id` aanwezig, extra kolommen).
- Crit. 9: unit (`"  ,   , a"`, `"   "`); db (lege elementen tellen niet voor n of de grens, term `a`); e2e (alleen spaties).
- Overig: i18n-sleutels (unit); anonieme aanroep (`42501` of 0 rijen); recepten van andere gebruikers zichtbaar; labels zichtbaar; knop en keuzelijst ≥ 44 × 44 px; geen horizontaal scrollen op 360 px met 10 lange termen en "k van n"; verbindingsfout met banner en behouden termen; link naar `/` leegt de velden en terug herstelt ze; typen springt niet.

## Niet gedekt
- Favorietenfilter (crit. 8): favorieten bestaan niet; hoort bij R-014.
- Aparte test voor "alleen tokens in de stijl": de bestaande `no-hardcoded-styles`-test scant `src/styles` al.
- Lay-outcontrole met zoekparameters in `tests/e2e/routes.ts`: niet toegevoegd (de eigen spec controleert `/` en `/?met=…` op 360 px).
- De 400 ms-grens in e2e is bewezen tot op 299/400 ms; verder dekt de unit-test de constante.
- Verschil NFD tegenover `unaccent` bij tekens als "œ": bewust niet getest (alleen risico, niet in de criteria).

## Herstel
Verbindingsverlies-test (recipe-search.spec.ts): `serviceWorkers: "block"` via geneste describe, route vóór goto. Gedrag ongewijzigd.

## Herstel review ronde 3
- Bevinding 1 (middel): `tests/db/recipe-search.test.ts` crit. 2 gebruikt nu ingrediënten `feta${s}` en `feta${s} blokjes`, termen `[feta${s}, tomaat${s}]`: `match_count = 1`, `term_count = 2`. Een telling per ingrediënt geeft 2 en laat de test falen.
- Extra: met k = 2 is datzelfde type recept (`feta${s}` + `gemarineerde feta${s}`, termen feta/tomaat) geen treffer.
- `npx tsc --noEmit` slaagt. De databanktest zelf niet gedraaid in deze sessie (commando vereiste goedkeuring).

## Herstel review ronde 2
- Late-antwoordtest (crit. 7) staat nu in een describe met `serviceWorkers: 'block'` en controleert `first === false` vóór `release()`, zodat de vertraging bewezen is.
- "Typen wordt niet onderbroken": typt eerst `feta…, `, wacht tot `met=` in de URL staat, typt dan `tom`. Een naïeve sync die het veld herschrijft faalt nu.
