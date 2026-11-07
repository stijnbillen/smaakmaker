# T-024 — review (ronde 2)

Beoordeeld: de volledige diff (migratie `20261107100000_recipe_search_catalog.sql`, `src/lib/ingredientSearch.ts`, `src/lib/recipes.ts`, `src/components/IngredientSearch.tsx`, `nl.json`/`fr.json`, `base.css`, `docs/beslissingen.md`) en de drie testbestanden, met de aanpassingen na ronde 1. In `VRAGEN.md` staat geen blok voor T-024. `CLAUDE.md` is niet gewijzigd. De kernbeslissingen worden niet geschonden:
- `search_recipes` blijft `security invoker` en heeft dezelfde signatuur.
- `search_term_info` is `security definer`, controleert de aanmelding en geeft `anon` geen execute-recht.
- De wijziging staat in een migratie.
- De nieuwe teksten staan met dezelfde sleutels in beide JSON-bestanden.

De tests heb ik niet zelf gedraaid. Volgens `docs/loop-log.md` slaagde de build na ronde 1.

Ronde 1:
- **Bevinding 1** (middel): opgelost. Er is nu een E2E-test op `/favorieten`.
- **Bevinding 3**: opgelost met `expect.poll`.
- **Bevinding 4**: de uitleg in `T-024-tests.md` volstaat. De taalkeuze staat niet op het overzicht en `useTermInfo` haalt opnieuw op bij een taalwissel (`lang` staat in de afhankelijkheden).
- **Bevindingen 2 en 5**: blijven open met ernst laag. Ze staan hieronder opnieuw.

## Bevindingen

### 1. Favorietentest: de controle op "alleen het favoriete recept" slaagt altijd
- **Bestand:** `tests/e2e/recipe-search-synonyms.spec.ts`, test "\"brocoli\" on the favourites page gives only the favourite broccoli recipe", regel `await expect(item(page, other.title)).toHaveCount(0)`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** `other` is geen favoriet en staat dus nooit op `/favorieten`, ook zonder zoekterm. De test bewijst alleen dat "brocoli" op die pagina het favoriete recept vindt. Hij bewijst niet dat het zoeken daar ook iets wegfiltert. Mijn voorstel uit ronde 1 (twee broccolirecepten, één favoriet) had dezelfde zwakte.
- **Voorstel:** Maak twee favorieten: één met broccoli en één zonder (bv. rijst). Controleer vóór het zoeken dat beide zichtbaar zijn. Controleer na "brocoli" dat het rijstrecept verdwenen is en het broccolirecept blijft.

### 2. "Al toegevoegd.": de dubbele term staat eerst toch even in de URL (open uit ronde 1)
- **Bestand:** `src/components/IngredientSearch.tsx:84-90` (`emit`) en `:146-151` (effect op `infoKey`)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Na Enter of na de debounce gaan eerst beide termen naar de URL (`met=broccoli&met=brocoli`). Pas als `search_term_info` antwoordt, volgt een tweede `emit` met de ontdubbelde termen. Het effect stuurt daarbij ook de tekst van het andere veld mee, zonder debounce. De E2E-test erkent die tussenstap uitdrukkelijk (commentaar bij `expect.poll`). Het eindresultaat klopt.
- **Voorstel:** Werk de URL in de tweede stap bij met `replace`, zodat de geschiedenis geen extra stap krijgt. Of leg de tussenstap vast als keuze in `docs/beslissingen.md`.

### 3. `search_term_info`: `limit 1` zonder vaste volgorde (open uit ronde 1)
- **Bestand:** `supabase/migrations/20261107100000_recipe_search_catalog.sql:163-167`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Welke suggestie als de "beste" volgens R-019 terugkomt, hangt af van de volgorde waarin `catalog_suggest` zijn rijen teruggeeft, na `where` en `limit 1`. SQL garandeert die volgorde niet.
- **Voorstel:** Gebruik `from public.catalog_suggest(...) with ordinality as c(id, name_nl, name_fr, matched, match_kind, distance, similarity, ord)` en `order by c.ord limit 1`.
