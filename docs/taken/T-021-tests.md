# T-021 — Testverslag

`npx tsc --noEmit` faalt nu alleen op ontbrekende productiecode (testnaden): `displayName`, `suggestionLabel`, `CatalogItem` (catalog.ts), `src/lib/ingredientPicker.ts`, de nieuwe velden `ingredient`/`unitItem`/`size`/`freeText` op `IngredientDraft`/`Ingredient`, een derde parameter van `draftFromRecord`, en de vijf parameters van `ingredientLine`. Geen fouten in de tests zelf.

## Aannames over de API (ontwikkelaar: pas aan, of meld het; dan pas ik de test aan)
- `resolveOnLeave(text, rows, max)`: `max` = maximale tekstlengte (80 naam / 20 eenheid). Opties worden intern op 5 afgekapt. Uitkomst `link` heeft `item.id`, `didYouMean` heeft `options[].id`.
- `ingredientLine(ingredient, original, desired, item?, lang?)`.
- `draftFromRecord(record, sizes?, catalog?: ReadonlyMap<string, CatalogItem>)`; zet `name`/`unit` in het formulier op `displayName` in de actieve taal.
- `toRow` gebruikt de actieve taal (`getLanguage()`) voor de momentopname in `name`/`unit`.
- `CatalogItem.nameNl/nameEn` zijn `string | null`.
- Zonder geladen item blijft `draftFromRecord` de ids bewaren (variant- en bewaartest zonder catalogus).

## Tegenstrijdigheid in de brief
Crit. 7 zegt dat `size: ""` met `23514` geweigerd wordt; het plan zegt dat `recipes_normalize()` een lege `size` weglaat. De databanktest accepteert beide uitkomsten (geweigerd, of weggelaten). Beslis welke het wordt; wil de eigenaar de strikte lezing, dan vervalt de normalisatie voor `size`.

## Gedekt
| Crit. | Waar |
|---|---|
| 1 | unit `ingredientPicker.test.ts` (`suggestionLabel`, `shouldFetch`); e2e `ingredient-picker.spec.ts` (lijst, ≤5, synoniem, "b", Engels, 44 px, 360 px) |
| 2 | unit `resolveOnLeave` (exact wint); e2e suggestie tikken, "Tomato"/"EL" automatisch gekoppeld |
| 3 | unit `didYouMean`, prefix telt niet, max 5; e2e "paprica" (knoppen, koppelen, "Nee") |
| 4 | unit `askNew`; e2e vraag letterlijk, Ja (nl en en), Nee, race |
| 5 | unit `validateRecipe` 80/20/81/21; db vrije regel; bestaande R-003-tests ongewijzigd |
| 6 | e2e eenheid ("theelepel → tl", "Bedoelde u el?", nieuwe eenheid, lege eenheid); unit `none` |
| 7 | unit `ingredientLine` nl/en/zonder/met eenheid; db size-waarden en 23514; e2e detail + wissel naar English; sleuteltest in `recipe-catalog.test.ts` |
| 8 | unit omrekenen 4→6, `recipeTextBytes` +5/+6/+5; db `recipe_text_bytes` gelijk |
| 9 | unit `displayName`, terugval, `draftFromRecord` met catalogus; db hernoemen (receptrij ongewijzigd) en verwijderen; e2e detail en bewerkformulier |
| 10 | unit `variantDraft`; e2e variant met ids, formaat en vrije regel |
| 11 | unit `invalid`; e2e 81 tekens en lege naam; db `add_ingredient` 23514 |
| Overal | e2e open lijst en open vraag op 360 px, tikdoelen ≥ 44 px |

## Niet of deels gedekt
- Crit. 3 e2e "twee of meer suggesties: één knop per suggestie, volgorde R-019": alleen unit (volgorde en max 5); e2e vergt kennis van de startlijst-volgorde.
- Crit. 9 "item niet geladen → terugval op opgeslagen naam": alleen unit (`ingredientLine`); geen e2e die een mislukte lading afdwingt.
- Crit. 1/overal: de beide-talen-lay-outtest (`layout.spec.ts`) is niet uitgebreid. Het formulier met open lijst staat in de nieuwe spec, alleen in het Nederlands. De ontwikkelaar mag `layout.spec.ts` laten dekken, of ik doe dat in een herstelronde.
- Late antwoorden/races van de gebruiker (tekst gewijzigd tijdens de aanroep): geen test; die vergt een vertraagde netwerkmock.
- Sleutelpariteit nl/en: bestaande `i18n.test.ts` bewaakt dat; de nieuwe sleutels zelf (`form.size`, `form.didYouMean` …) worden pas getest via de e2e-teksten.

## Herstelronde (testfouten na BLOKKADE ontwikkelaar)
Alleen tests aangepast, gedrag onveranderd. Niet kunnen draaien (geen toestemming voor vitest/playwright); `tsc --noEmit` is schoon.
- `tests/db/recipe-ingredient-size.test.ts`: bytes-test gebruikt titels van gelijke lengte (titel telt mee in `recipe_text_bytes`).
- `ingredient-picker.spec.ts`: `openNew` wacht op het titelveld in de gekozen taal ("Title"); same-text `fill` ("paprica" na "Nee") eerst leeggemaakt; veldmelding is een gewone `<p>` zonder `role="alert"`, dus `getByText(form.nameInvalid)`; taalwissel loopt via Profiel en `goBack()`, zonder herladen.
- `recipe-catalog.spec.ts`: opgeslagen momentopname na bewerken zonder hernoemen is de itemnaam ('broccoli').
- `language.spec.ts`: naam- en eenheidsveld zijn `combobox`.
- `connection.spec.ts`: "Zout" koppelt aan het item, veldwaarde `/^zout$/i`.

## Herstelronde 2 (testfouten na BLOKKADE ontwikkelaar)
Alleen tests aangepast, gedrag onveranderd.
- `ingredient-picker.spec.ts`: optie-selector `/potato/` -> `/^potato$/` (matchte ook "sweet potato", strict-mode-fout).
- `tests/helpers/recipe-form.ts`: `quantityFields`, `unitFields`, `sizeFields`, `catalogQuestion`, `answerQuestionsNo` en `stepFields` herkennen nu ook Engelse labels (Quantity, Unit, Size, Did you mean, New ingredient, New unit, No, Step).

## Herstelronde 3 (testfouten na BLOKKADE ontwikkelaar)
Alleen tests aangepast, gedrag onveranderd.
- `ingredient-picker.spec.ts` "in English aardap offers potato": optie gezocht op het volledige label `aardappel → potato` (exact), niet `/^potato$/` (crit. 1).
- Nieuw-item-tests (Ja nl/en, race): itemnamen zijn nu 12 willekeurige letters (`rnd()`), zonder gedeeld voorvoegsel `tempeh-e2e-`. Anders gaf een eerder achtergebleven item een "Bedoelde u"-vraag in plaats van de nieuw-item-vraag (crit. 4, 6).
- `beforeAll` verwijdert achtergebleven `tempeh-e2e-%`-items van oudere runs.
- Helpers (`quantityFields`, `unitFields`, `sizeFields`) herkennen al Engelse labels (herstelronde 2).

## Gewijzigde bestaande tests
- `tests/helpers/recipe-form.ts`: naam- en eenheidsveld zijn nu `combobox`; `fillRecipe` verlaat het laatste veld en beantwoordt open vragen met "Nee" (`answerQuestionsNo`); nieuwe helpers `sizeFields`, `catalogQuestion`.
- `tests/unit/recipe-catalog.test.ts`: herschreven. De R-018-sleutelvergelijking (`keepRef`) verdwijnt volgens het plan; de koppeling hangt nu aan "veld niet aangeraakt".
- `tests/e2e/recipe-catalog.spec.ts`: een andere naam typen beantwoordt de vraag met "Nee".
- Let op voor de ontwikkelaar: andere specs gebruiken `fillRecipe`; namen die niet in de startlijst staan krijgen automatisch "Nee". Specs die zelf op `textbox` zoeken naar Ingrediënt/Eenheid bestaan niet (gecontroleerd).

## Review-ronde (bevindingen 1, 2, 4)
- Crit. 9: rename-test controleert nu ook de Engelse naam op detailpagina en in het bewerkformulier (`smaakmaker.lang = 'en'`).
- Crit. 3: nieuwe e2e met twee gelijkende items; controleert één knop per suggestie in de volgorde van `suggest_ingredients(…, false)`, de vraagtekst met " / " en de knop "Nee, … is nieuw". Items worden in `afterAll` opgeruimd.
- 360 px: lijst/vraag-test loopt nu in `nl` en `en`.
- `npx tsc --noEmit` slaagt. De Playwright-run kon ik in deze sessie niet starten (geen toestemming); de nieuwe tests zijn dus niet uitgevoerd.
- Bevindingen 3 en 5 horen bij de ontwikkelaar; niet aangeraakt.
