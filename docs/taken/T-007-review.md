# T-007 — Review (R-013: Porties en omrekenen)

Basis: werkkopie tegen `708f675` (T-006), inclusief de nieuwe bestanden. `VRAGEN.md` heeft geen blok voor T-007.

## Samenvatting

- Crit. 1: gedekt door unit-tests (`parseServings`, `validateRecipe`, `toRow`, `draftFromRecord`), databanktests (verplicht, bereik, `22P02`, update door de auteur, 0 rijen voor een ander) en e2e-tests (melding, `aria-*`, `inputmode`, geen POST, bewerken).
- Crit. 2–5: gedekt door e2e-tests. De databankwaarde wordt na het omrekenen via de service-sleutel gecontroleerd.
- Migratie aanwezig (`20261102140000_recipe_servings.sql`), zelfde patroon als de tijden. Geen nieuwe policy, alleen een kolomrecht.
- `CLAUDE.md` is niet gewijzigd. Er wordt geen kernbeslissing geschonden: limiet en rechten zitten in de databank, teksten in `nl.json` en de stijl gebruikt alleen tokens.

## Bevindingen

### 1. Enkelvoud ontbreekt in de notitie bij 1 portie
- **Bestand:** `src/i18n/nl.json:71` (`servings.original`), `src/pages/RecipeDetailPage.tsx:112`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Bij een recept voor 1 portie staat na het aanpassen "Recept is voor 1 porties.". Dat is fout Nederlands in zichtbare tekst.
- **Voorstel:** Voeg een aparte sleutel toe (bv. `servings.originalOne`: "Recept is voor 1 portie.") en kies die bij `stored === 1`.

### 2. Opmaakfouten in bestaande regels
- **Bestand:** `src/i18n/nl.json:73` (`"time.prep":"Preptijd"`), `src/lib/recipe.ts:131` (`export type TitleError ='titleInvalid';`)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Door de wijziging is in twee regels die niets met deze taak te maken hebben een spatie verdwenen. Dat geeft ruis in de diff, en Prettier of de linter kan erover klagen.
- **Voorstel:** Zet de oorspronkelijke opmaak terug.

### 3. Overbodige alias voor de status
- **Bestand:** `src/pages/RecipeDetailPage.tsx:24`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `const chosen = chosenState;` voegt niets toe en laat denken dat er een afleiding tussen zit.
- **Voorstel:** Gebruik `chosenState` rechtstreeks, of noem de status `chosen`.

### 4. Bestanden buiten de scope in de werkkopie
- **Bestand:** `README.md`, `.env.example` (nieuw, niet gevolgd)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Geen van beide hoort bij R-013, en het plan in `docs/taken/T-007.md` noemt ze niet. Ze komen mee in de commit van T-007.
- **Voorstel:** Laat ze uit de commit van T-007 en neem ze apart op (eigen taak of savepoint). De inhoud zelf is in orde: er staat geen geheime sleutel in `.env.example`.

### 5. DDL in een e2e-test op de gedeelde lokale databank
- **Bestand:** `tests/e2e/recipe-servings.spec.ts:228-234`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De test laat in één transactie de checks vallen en voegt ze daarna opnieuw toe. Dat werkt, en de lock voorkomt dat er tussendoor iets geschreven wordt. Maar de definitie van de checks staat in de test hard gecodeerd. Wijzigt de migratie de checks ooit, dan zet de test stil de oude vorm terug, en tot de volgende `supabase db reset` wijkt het schema dan af van de migratie.
- **Voorstel:** Lees de huidige definitie op met `pg_get_constraintdef` en voeg die letterlijk opnieuw toe (`not valid`). Of zet een comment bij de test dat hij moet meeveranderen als de migratie verandert.
