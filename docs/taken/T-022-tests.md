# T-022 — tests (R-026: Frans in plaats van Engels)

Status: tests omgezet; ze falen tot de ontwikkelaar klaar is (nieuwe taak, geen bestaand gedrag).
`npx tsc --noEmit` geeft nu enkel fouten die uit ontbrekende productiecode komen: `src/i18n/fr.json`, `Language = 'nl' | 'fr'`, `CatalogItem.nameFr`, `Suggestion.nameFr`, `CatalogLang`. Geen fouten in de tests zelf.
Vitest, Playwright en `supabase db reset` konden in deze sessie niet gedraaid worden (geen toestemming voor die commando's); alleen de typecheck is uitgevoerd.

## Herstel na melding ontwikkelaar
- `RETIRED_*` verhuisd naar `tests/helpers/retired-lang.ts` (zonder imports): `language.ts` importeert vitest en `src/`, wat Playwright (`e2e/language.spec.ts`) niet kan laden.
- `ingredientNameFields` in `recipe-form.ts`: regex `/^Ingr[eé]di[eé]nt/` dekt nu ook Frans "Ingrédient".
- Daarna gemeld door ontwikkelaar: die regex miste `ë`, dus Nederlands "Ingrediënt" werd niet gevonden en veel e2e-tests liepen op een time-out. Regex is nu `/^Ingr[eéë]di[eéë]nt/`. Alleen de helper is aangepast; het getoetste gedrag is niet veranderd. Playwright niet gedraaid.
- Gemeld door ontwikkelaar: `quantityFields`, `unitFields`, `sizeFields` zochten alleen op "Hoeveelheid|Quantity", "Eenheid|Unit", "Formaat|Size", dus 3 Franse tests in `ingredient-picker.spec.ts` faalden. Regexes uitgebreid met "Quantité", "Unité", "Taille". Zelfde soort gat gedicht in dezelfde helper: `catalogQuestion` (+ "Vouliez-vous|Nouvel ingrédient|Nouvelle unité"), "Nee" → ook "Non" in `answerQuestionsNo`, `stepFields` (+ "Étape"). Labels komen uit `fr.json`. Alleen helper aangepast, getoetst gedrag ongewijzigd. Playwright niet gedraaid (geen toestemming).
- `english-terms.ts`: commentaar bevatte `"piece"` tussen aanhalingstekens en trof de eigen scan; herschreven.
- `SAME_ALLOWED` in `i18n.test.ts`: niet-bestaande sleutel `time.grams` verwijderd. `npx tsc --noEmit` schoon; vitest/Playwright niet gedraaid.

## Nieuwe hulpbestanden
- `tests/helpers/retired-lang.ts`: `RETIRED_LANG`, `RETIRED_BROWSER_GB`, `RETIRED_BROWSER_US`. De oude taalcode wordt uit stukken samengesteld, zodat de scan-test geen letterlijke "en" in de tests vindt.
- `tests/helpers/english-terms.ts`: de Engelse catalogustermen (tomato, potato, onion, tablespoon, …) uit stukken samengesteld, voor de db-test en de scan.

## Gedekt per criterium
1. **en.json weg, fr.json volledig** — `tests/unit/i18n.test.ts`: `existsSync` (en weg, fr er), sleutels beide richtingen, geen lege waarden, gelijke plaatsaanduidingen, geen Franse waarde gelijk aan de Nederlandse (kleine uitzonderingenlijst, plus waarden zonder letters of ≤ 3 tekens), steekproef (`nav.profile` = "Profil", `language.fr` = "Français", `time.hours` = "{h} h"), `fr satisfies Record<TextKey,string>` via tsc. `app.name` blijft "Smaakmaker".
2. **Geen "en"; oude keuze geeft geen fout** — `tests/unit/language.test.ts` (`detectLanguage` fr-BE/FR/nl-BE/en-US/de/[]; `loadLanguage` met oude waarde + fr-FR → fr, + en-GB → nl; geen exception; `initLanguage`; `locale()` nl-BE/fr-BE); `tests/e2e/language.spec.ts` (oude waarde + `fr-BE` → Frans, `<html lang="fr">`, geen console-fout; met `en-GB` → Nederlands). Scan: `tests/unit/no-english.test.ts` (src, migraties, templates, scripts, tests; nl.json uitgezonderd omdat "en" daar het Nederlandse woord is).
3. **`name_fr`** — `tests/db/catalog.test.ts` (kolommen via `information_schema`, geen `_en`-kolom; `add_*('…','fr')` vult `name_fr`, `name_nl` null; oude code → 22023; gewone gebruiker kan `name_fr` invoegen, niet bijwerken); `tests/db/catalog-suggest.test.ts` (resultaatrij heeft `name_fr`, geen `_en`-sleutel; `p_lang` oude code en `de` → 22023); `tests/db/recipe-ingredient-size.test.ts`; scan op `name_en`/`nameEn` overal.
4. **Startlijsten** — `tests/db/catalog.test.ts`: ≥ 150 / ≥ 25 met beide namen, broccoli/brocoli met synoniemen `brocolli` en `broccolli`, aardappel/pomme de terre, tomaat/tomate, `item_key('tomate')` → tomaat, `item_key('pomme de terre')` → aardappel, de acht eenheidsparen (el/c. à soupe, tl/c. à café, stuk/pièce, snuf/pincée, teentje/gousse, takje/brin, blik/boîte, bosje/botte) als één rij en via de Franse sleutel, geen Engelse sleutels (tomato, potato, onion, tablespoon, teaspoon, pinch, clove, bunch). R-019-voorbeelden in `catalog-suggest.test.ts` omgezet naar "tomate"/"brocolli"; "paprica", "tomaaat", "zout", "xqzv" ongewijzigd.
5. **Formaten** — `tests/unit/recipe-catalog.test.ts` ("2 aardappel (groot)" / "2 pomme de terre (grande taille)", drie formaten fr), `tests/unit/i18n.test.ts` (`recipe.sizeSmall|Medium|Large` exact), `tests/e2e/ingredient-picker.spec.ts` (keuzelijst in het Frans toont de drie `form.size*`-teksten uit `fr.json`, en schakelen zonder herladen).
6. **Mail en notatie** — `tests/unit/email-templates.test.ts` (nl-blok vóór fr-blok, `lang="fr"`, geen `lang="en"`, onderwerp `{nl} / {fr}` in config.toml, generator reproduceert templates), `tests/db/auth-invites.test.ts` (Mailpit-onderwerp en Franse kop), `format.test.ts` ("1 novembre 2026", "9 novembre 2026 à 14:05", "1 h 30 min"), `recipe.test.ts` (komma in beide talen, `parseQuantity('0.25'|'0,25')`), `recipeSize.test.ts` (komma in fr), `reviews.test.ts` (4,3 in fr), `language.spec.ts` (komma in het Frans, invoer met punt en komma).
7. **Geen Engelse testgegevens** — alle `'en'`-gebruik vervangen door `'fr'` en Franse termen ("tomate", "pomme de terre"); scan-test controleert stringliteralen met de oude Engelse catalogustermen in `src/` en `tests/` (uitzondering: `tests/helpers/style-scan.ts`, waar "tomato" een CSS-kleurnaam is).
8. **360 px in beide talen** — `tests/e2e/layout.spec.ts` loopt nu over `nl` en `fr`; `ingredient-picker.spec.ts` toetst de open lijst en vraag in beide talen op 360 px.

## Niet (volledig) gedekt
- Kwaliteit van de Franse vertaling ("volledige Franse vertaling, Belgisch Frans") is niet automatisch te toetsen; alleen "niet gelijk aan Nederlands" en een steekproef. Dat blijft voor de review.
- "`npm test` groen" is het resultaat van alle tests samen; niet apart getest.
- De uitzonderingenlijst in `i18n.test.ts` (`SAME_ALLOWED`) kan kleiner of groter moeten blijken zodra `fr.json` bestaat: een Franse waarde die toevallig gelijk is aan de Nederlandse (bv. een woord als "Menu") moet de ontwikkelaar expliciet melden of de lijst krijgt een toelichting.
- De exacte Franse woorden in `size.used` ("sur 2 Mo"?) zijn niet vastgelegd; `recipeSize.test.ts` controleert alleen komma en de aanwezigheid van "2".

## Testnaden / aannames
- Geen aanpassing in de productiecode nodig voor testbaarheid. Aannames over namen: `CatalogItem.nameFr`, `Suggestion.nameFr`, `Language = 'nl' | 'fr'`, `CatalogLang`, `recipe.sizeSmall|Medium|Large` (bestaan al), `form.yes`/`form.titleLabel` in `fr.json`.
- `tests/e2e/ingredient-picker.spec.ts` verwacht in het Frans een knop met `fr['form.yes']`.
