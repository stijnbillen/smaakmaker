# T-021 — Review (R-020: ingrediënten en eenheden kiezen in het formulier), ronde 3

Beoordeeld: de werkkopie tegen `e09f884` (HEAD), inclusief de nieuwe bestanden (`CatalogField.tsx`, `ingredientPicker.ts`, de migratie `20261106140000_recipe_ingredient_size.sql`, `recipe-ingredient-size.test.ts`, `ingredient-picker.spec.ts`, `ingredientPicker.test.ts`). `VRAGEN.md` heeft geen blok voor T-021.

`CLAUDE.md` is niet gewijzigd. Ik zag geen kernbeslissing die geschonden wordt:
- nieuwe items gaan alleen via `add_ingredient`/`add_unit`, en er komen geen nieuwe rechten bij;
- er staan geen sleutels in de client;
- `size` telt mee in `recipe_text_bytes` en in `recipeTextBytes`, met dezelfde bytes;
- de nieuwe teksten staan in `nl.json` en `en.json`, met dezelfde sleutels;
- de stijl gebruikt alleen tokens.

De migratie wijzigt alleen functies (`create or replace`). Elke functie is gelijk aan haar laatste versie (`recipe_catalog_links`, `recipe_size_limit`, `recipe_equipment`), plus `size`.

## Bevindingen uit ronde 2
- **1 (crit. 9, Engelse naam na hernoeming):** opgelost. `ingredient-picker.spec.ts:339-344` controleert `<naam>-en` op de detailpagina en in het bewerkformulier.
- **2 (crit. 3, twee of meer suggesties):** opgelost. `ingredient-picker.spec.ts:162-180` controleert het aantal knoppen, de volgorde tegenover `suggest_ingredients`, de vraagtekst met " / " en de knop "Nee, … is nieuw".
- **3 (formaat in de globale taal):** opgelost in de code met `tIn(lang, …)` (`src/lib/recipe.ts:222`). Er is nog geen test voor; zie bevinding 1 hieronder.
- **4 (360 px alleen in het Nederlands):** opgelost. `ingredient-picker.spec.ts:97` loopt nu in `nl` en `en`.
- **5 (R-025 in `REQUIREMENTS.md`):** staat nog in de werkkopie; zie bevinding 3 hieronder.

## Bevindingen

### 1. Geen test voor het formaat in een andere taal dan de globale
- **Bestand:** `tests/unit/recipe-catalog.test.ts:128-133`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Vóór elke aanroep zet de test de globale taal op dezelfde waarde als `lang` (`useLanguage(...)`). Zou `ingredientLine` het formaat opnieuw met `t()` vertalen in plaats van met `tIn(lang, …)`, dan slaagt de test nog steeds. De oplossing voor bevinding 3 uit ronde 2 is dus niet beschermd.
- **Voorstel:** Voeg een geval toe met `useLanguage('nl')` en `ingredientLine(line, 2, 2, potato, 'en')`, en verwacht `'2 potato (large)'`.

### 2. Typen en terugzetten maakt het formulier "gewijzigd"
- **Bestand:** `src/components/RecipeForm.tsx:409` en `:440`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Elke `onChange` zet `freeText: { ...cur.freeText, name: v.free }`. Daardoor krijgt de regel een sleutel `freeText` (`{}` of `{ name: undefined }`) die in `initial` niet bestaat. Typt de gebruiker in een bestaand recept iets en zet hij de oorspronkelijke tekst terug, dan verwijst de regel weer naar hetzelfde item, maar `isDirty` blijft `true`. Bij weggaan verschijnt dan onterecht de vraag over niet-bewaarde wijzigingen.
- **Voorstel:** Laat een `freeText` zonder `true`-waarden weg, in de patch of in de signatuur van `isDirty`.

### 3. Niet-taakgebonden wijziging in `REQUIREMENTS.md` (R-025), plus een procesnotitie in `docs/beslissingen.md`
- **Bestand:** `REQUIREMENTS.md:49-60`, `:405`, `:419`; `docs/beslissingen.md:380`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** R-025 (icoon) staat nog in de werkkopie en hoort niet bij T-021. `docs/beslissingen.md:380` zegt "laat de eigenaar dat apart committen". Dat is een notitie over de commit en geen beslissing.
- **Voorstel:** Laat `REQUIREMENTS.md` buiten de commit van T-021, en haal regel 380 uit `docs/beslissingen.md`.

## Opmerkingen zonder bevinding
- Mislukt de controle bij verlaten door een verbindingsfout, dan blijft het veld `unsettled`. "Opslaan" gaat dan verder als vrije tekst, zonder vraag (`RecipeForm.tsx:172-188`). Dat past bij het plan ("zonder verbinding blijft de regel vrije tekst"), en het opslaan zelf meldt de verbindingsfout.
- De bevindingen van ronde 2 over `size: ""` en de plaats van de unit tests blijven aanvaardbaar, zoals in ronde 2 beschreven.
