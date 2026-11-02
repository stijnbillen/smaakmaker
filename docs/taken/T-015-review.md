# T-015 — review (tweede poging, ronde 3)

Beoordeeld: de werkmap tegen `bda7139`, met de nieuwe bestanden erbij (migratie `20261103120000_recipe_search.sql`, `src/lib/ingredientSearch.ts`, `src/components/IngredientSearch.tsx`, de drie testbestanden), plus de wijzigingen in `RecipeListPage.tsx`, `nl.json`, `base.css` en `docs/beslissingen.md`.

`CLAUDE.md` is niet gewijzigd en er wordt geen kernbeslissing geschonden. `VRAGEN.md` heeft geen blok voor T-015.

## Stand van de bevindingen uit ronde 2
- **Bevinding 1** (late antwoorden zonder echte vertraging): hersteld. De test staat in een `describe` met `serviceWorkers: 'block'` en controleert `first === false` vóór `release()` (`tests/e2e/recipe-search.spec.ts:309-351`).
- **Bevinding 2** (typen wordt niet onderbroken): hersteld. De test typt eerst `feta…, `, wacht op `met=` en typt dan `tom` (`tests/e2e/recipe-search.spec.ts:539-549`). Een naïeve sync laat deze test falen.
- **Bevinding 3** (README.md en .env.example): blijft open, zie hieronder.

## Bevindingen

### 1. Geen test bewijst dat één term hoogstens één keer telt
- **Bestand:** `tests/db/recipe-search.test.ts:117-123`
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** criterium 2 zegt: "één term telt hoogstens één keer". De test moet een recept hebben met twee ingrediënten die allebei dezelfde term bevatten. Door de suffix gebeurt dat hier niet. Het recept heeft de ingrediënten `feta${s}` en `fetakaas${s}`, en de term is `feta${s}`. `fetakaas${s}` (bv. "fetakaasabcd") bevat "fetaabcd" niet, dus maar één ingrediënt komt overeen. Een foute telling per ingrediënt (`count(*)` over ingrediënten × termen in plaats van `exists` per term) geeft dan ook `match_count = 1`, en de test slaagt toch. Ook de andere databank- en e2e-tests hebben nergens een term die twee ingrediënten van hetzelfde recept raakt. De implementatie zelf is correct (`exists` per term, migratie regel 66-74), maar die eigenschap is niet getest.
- **Voorstel:** zet de suffix zo dat de term in beide namen zit, bijvoorbeeld de ingrediënten `feta${s}` en `feta${s} blokjes` (of `gemarineerde feta${s}`), met de termen `[feta${s}, tomaat${s}]`. Verwacht dan `match_count = 1` en `term_count = 2`. Voeg eventueel een geval met k = 2 toe: dat recept is dan geen treffer.

### 2. Bestanden van een andere taak in de werkmap
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** volgens de brief horen deze bestanden bij T-012.
- **Voorstel:** commit ze niet onder T-015, of vermeld ze apart in de commit.

## Gecontroleerd zonder bevinding
- **Migratie:**
  - `fold_key`, het overslaan van lege termen en het ontdubbelen gebeuren vóór de grens van 10.
  - `strpos` behandelt `%` en `_` als gewone tekens.
  - `not exists` regelt "zonder".
  - `rating_avg` (numeric) en `rating_count` (integer) passen bij de returntypes van de bestaande functies, en `photos` is jsonb.
  - De functie is `security invoker`, en `anon` heeft geen `execute`.
  - De migratie eindigt met `notify pgrst`.
- **Pagina:**
  - Bij "alle" gaat `p_min = null` mee.
  - De volgorde is `match_count`, dan de beoordeling (`nullsFirst: false`), dan `created_at`.
  - Zonder zoektermen blijft de bestaande query.
  - `requestId` en het leegmaken van de lijst bij een andere zoekopdracht werken.
  - "k van n" komt uit `term_count`.
  - `emptyText` houdt rekening met `hasSearch`.
- **Component:**
  - De sync met de URL loopt via `lastEmitted`/`inFlight`.
  - Knop en Enter annuleren de debounce.
  - De debounce gebruikt de actuele `min`.
  - "Alle" schuift mee met n.
- **Tests:**
  - De unit-tests dekken `parseTerms`, `clampMin`, `parseSearch`, `toSearchParams` en de debounce met nep-timers.
  - De databanktests dekken criteria 1, 3, 4, 5, 8 (`lte`, `overlaps`, `order`) en 9, plus de anonieme aanroep.
  - De e2e-tests voor de pauze, de knop en Enter laten de klok echt stilstaan.
  - De e2e-tests voor sorteren op beoordeling, de filtercombinaties, de URL van buitenaf, de verbindingsfout en de lay-out op 360 px zijn aanwezig en kunnen falen.
