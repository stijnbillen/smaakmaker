# T-015 — review (R-009 Zoeken op ingrediënten)

Bekeken: migratie `20261102190000_recipe_search.sql`, `src/lib/ingredientSearch.ts`, `src/components/IngredientSearch.tsx`, `RecipeListPage.tsx`, `nl.json`, `base.css`, de drie testbestanden, `docs/beslissingen.md`.
`CLAUDE.md` is niet gewijzigd. Er wordt geen kernbeslissing geschonden: `security invoker`, geen grants voor anon, validatie in de databank, teksten in `nl.json`, alleen tokens in de stijl.

## Bevindingen

### 1. tests/e2e/recipe-search.spec.ts:218-228 — middel — tester
**Probleem:** de test "the button and Enter search at once" bewijst niet dat de knop of Enter iets doet. `page.clock.install()` zonder `pauseAt` laat de tijd gewoon doorlopen. Na `fill` vuurt de debounce dus binnen 300 ms, en `toHaveURL` wacht tot 5 s. Zou de knop niets doen, dan slaagt de test toch. De andere tests klikken ook op de knop en wachten daarna op hetzelfde resultaat, dus het deel "of bij een zoekknop" van crit. 7 is in feite niet gedekt.
Hetzelfde zwakke punt zit in 208-216: `runFor(400)` begrenst niets, omdat de tijd ook zonder die aanroep doorloopt. Een debounce van 1000 ms zou slagen. De grens van 400 ms is nu alleen gedekt via de constante in de unit-test.
**Voorstel:** zet de klok stil (`await page.clock.install(); await page.clock.pauseAt(...)` of `page.clock.setFixedTime`/`pauseAt` na `goto`).
- Knop/Enter: vul het veld in, klik of druk op Enter zonder `runFor` en verwacht dan de URL.
- Pauze: na het typen geeft `runFor(299)` nog geen `met=` in de URL, en een extra `runFor(101)` wel.

### 2. src/components/IngredientSearch.tsx:31-32 — laag — ontwikkelaar
**Probleem:** de getypte tekst wordt maar één keer uit `value` gezet. Verandert de URL van buitenaf terwijl de pagina open blijft (een link naar `/` in de kop, of terug/vooruit), dan tonen de velden nog de oude termen en de lijst iets anders.
**Voorstel:** synchroniseer `withText`/`withoutText` als `value.with`/`value.without` verschillen van `parseTerms(text)`. Doe dat niet tijdens het typen: vergelijk met de laatst uitgezonden waarde.

### 3. src/pages/RecipeListPage.tsx:93 en src/lib/ingredientSearch.ts:50 — laag — ontwikkelaar
**Probleem:** `parseSearch` ontdubbelt de URL-termen alleen op exacte tekst, en `p_min` wordt geklemd op de n van de client. Bij `?met=Feta&met=feta&min=2` (of bij tekens waar NFD en `unaccent` verschillen, bv. "œ") is n in de databank kleiner. De functie geeft dan `22023` en het overzicht toont `overview.error` in plaats van resultaten. De keuzelijst toont dan ook meer opties dan "k van n" laat zien.
**Voorstel:** ontdubbel in `parseSearch` met dezelfde `simpleKey` als `parseTerms`. Of laat `p_min` weg als die gelijk is aan of hoger is dan de n van de client, zodat de databank "alle" kiest.

### 4. README.md, .env.example (untracked) — laag — ontwikkelaar
**Probleem:** de twee bestanden horen bij T-012 (zie `docs/beslissingen.md`, sectie T-012) en staan nog ongecommit in de werkmap. Ze komen dus mee in de commit van T-015, buiten de scope van deze taak.
**Voorstel:** commit ze apart of vermeld ze in de commit van T-015.

## Niet gedekt (bewust, geen bevinding)
- Het favorietenfilter uit crit. 8 wordt getest in T-017 (R-014). Het RPC-resultaat bevat `id` en zit in een gewone filterketen.
