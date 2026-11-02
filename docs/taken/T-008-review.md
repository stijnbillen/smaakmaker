# T-008 — review

Beoordeeld: werkkopie tegen `8c5c189` (T-007), inclusief nieuwe bestanden.

## Samenvatting
- Crit. 1: gehaald. De databank dwingt het af met de checks `recipes_source_len`/`recipes_note_len` en trim naar `null` in `recipes_normalize()`. Unit-, db- en e2e-tests dekken de grenzen 200/201 en 1000/1001, plus "geen POST".
- Crit. 2: gehaald. De e2e-tests dekken leeg, alleen bron, alleen opmerking en een `null`-rij.
- Crit. 3: gehaald. `sourceLink` laat alleen http(s) door. De e2e-test controleert de exacte `rel`, `target` en `href`, en een nieuw tabblad met afgevangen route. `javascript:` en `www.` blijven gewone tekst.
- Migratie: `create or replace` van `recipes_normalize()` neemt de volledige bestaande inhoud uit `20261102120000_recipe_content.sql` over (titel, ingrediënten, stappen). Geen latere migratie overschrijft de functie. Het kolomrecht is uitgebreid, de update-policy is ongewijzigd. Auteur, ander en beheerder zijn in db-tests getest.
- `CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden: teksten in `nl.json`, stijl alleen via tokens, geen geheimen.

## Bevindingen

### 1. src/pages/RecipeDetailPage.tsx:86-87 — laag — ontwikkelaar
**Probleem:** `const link = sourceLink(recipe.source);` staat tussen het bestaande comment "Temporary choice, tied to the recipe id…" en de code waar dat comment over gaat (`stored`/`desired`). Het comment lijkt nu over `link` te gaan.
**Voorstel:** zet `const link = …` boven het comment of na de regel met `desired`.

### 2. src/lib/recipes.ts:52 — laag — ontwikkelaar
**Probleem:** het comment "Old rows may lack the columns entirely" klopt niet. Na de migratie heeft elke rij de kolommen; staan ze niet in het schema, dan faalt de `select` en geeft de `??` niets terug. Een oude rij heeft `null`, en dat wordt al zonder `??` doorgegeven.
**Voorstel:** laat het comment weg, of schrijf het waarom (bv. een onvolledige mock in tests), als dat de echte reden is.

### 3. README.md, .env.example (nieuw, niet gevolgd) — laag — ontwikkelaar
**Probleem:** twee nieuwe bestanden staan niet in het plan van T-008 en hebben niets met R-015 te maken. Dat is scope buiten de taak. De inhoud is onschuldig (geen geheime sleutel, alleen een placeholder).
**Voorstel:** neem ze niet op in de commit van T-008, of meld ze apart in `docs/beslissingen.md`/de loop-log als ze bewust bij deze ronde horen.

### 4. tests/db/recipe-source-note.test.ts:77 — laag — tester
**Probleem:** de test "200 characters with spaces around" stuurt ook een opmerking van 1000 tekens met spaties mee, maar controleert alleen de lengte van `source`. Dat de opmerking na het trimmen 1000 tekens is, wordt niet nagegaan.
**Voorstel:** voeg `expect(res.data?.note).toHaveLength(1000)` toe.
