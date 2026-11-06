# T-021 — Review (R-020: ingrediënten en eenheden kiezen in het formulier)

Beoordeeld: de werkkopie tegen `1de6be2` (de commit met de BLOKKADE), inclusief de nieuwe bestanden. `CLAUDE.md` is niet gewijzigd. Ik zag geen kernbeslissing die geschonden wordt: de rechten blijven via `add_ingredient`/`add_unit`, er staan geen sleutels in de client, `size` telt mee in beide groottetellingen, en de teksten staan in beide taalbestanden met dezelfde sleutels.

De twee punten van de BLOKKADE zijn opgelost:
- `ingredient-picker.spec.ts:93` zoekt het exacte label `aardappel → potato`.
- `tests/helpers/recipe-form.ts` herkent nu ook de Engelse labels (`Quantity`, `Unit`, `Size`, `Step`, `Did you mean`, `New ingredient`, `New unit`, `No`).

## Bevindingen

### 1. Crit. 9: e2e controleert de Engelse naam na een hernoeming niet
- **Bestand:** `tests/e2e/ingredient-picker.spec.ts:307-318`
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** De brief vraagt: "herlaad de detailpagina: die toont de nieuwe Nederlandse naam, en in het Engels de nieuwe Engelse naam". De test vult `name_en` in, maar controleert alleen de Nederlandse naam (detailpagina en bewerkformulier). De db-test (`recipe-ingredient-size.test.ts:98-118`) controleert alleen de join in SQL, niet wat het scherm toont. Een fout in `displayName`/`ingredientLine` met `lang = 'en'` op de detailpagina na een hernoeming wordt dus door geen enkele e2e-test opgemerkt.
- **Voorstel:** Laad dezelfde pagina daarna met `smaakmaker.lang = 'en'` (`addInitScript`) en verwacht `newName + '-en'` op de detailpagina, en eventueel ook in het bewerkformulier.

### 2. Crit. 3: geen e2e voor twee of meer suggesties in de "Bedoelde u"-vraag
- **Bestand:** `tests/e2e/ingredient-picker.spec.ts:144-169`
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** De brief vraagt een e2e-test: "bij twee of meer suggesties staat er één knop per suggestie (hoogstens 5), in de volgorde van R-019". Alleen de unit test van `resolveOnLeave` dekt dit (`ingredientPicker.test.ts:71-76`). Of `CatalogField` ook echt één knop per optie toont, in die volgorde, en dat de vraagtekst met meerdere namen (`optionNames`, met " / " ertussen) klopt, wordt niet getest.
- **Voorstel:** Maak via `pg` twee testitems die op dezelfde invoer lijken (bv. `<rnd>a` en `<rnd>e`), typ `<rnd>o` en verlaat het veld. Controleer daarna het aantal knoppen (2 plus "Nee, … is nieuw"), hun volgorde tegenover `suggest_items(…, 'didYouMean')`, en ruim de items op in `afterAll`.

### 3. `ingredientLine` vertaalt het formaat met de globale taal, niet met de parameter `lang`
- **Bestand:** `src/lib/recipe.ts:223` (`t(SIZE_SHOWN[...])`)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De naam en de eenheid volgen de parameter `lang`, maar het formaat volgt `getLanguage()`. Met `lang` verschillend van de globale taal krijg je dus een gemengde regel ("2 potato (groot)"). Op de detailpagina zijn beide nu gelijk, maar de signatuur belooft iets anders. De unit test zet daarom vóór elke aanroep ook `useLanguage(...)` en ziet het probleem zo niet.
- **Voorstel:** Vertaal het formaat met de opgegeven `lang`, of laat de parameter weg en gebruik overal de globale taal.

### 4. Lijst en vraag op 360 px alleen in het Nederlands getest
- **Bestand:** `tests/e2e/ingredient-picker.spec.ts:96-111`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Volgens "Overal" moet het formulier in beide talen op 360 px passen. `layout.spec.ts` doet dat al voor het formulier in beide talen, maar de nieuwe toestand met een open lijst en een open vraag (de Engelse vraag is langer) wordt alleen in het Nederlands gemeten.
- **Voorstel:** Laat dezelfde test ook met `openNew(page, 'en')` lopen.

### 5. Niet-taakgebonden wijziging in `REQUIREMENTS.md` (R-025 App-icoon)
- **Bestand:** `REQUIREMENTS.md:49-60` en `:405`, `:419`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De werkkopie bevat een nieuwe requirement R-025 (koksmuts-icoon) en twee regels in de keuzelijst. Dat hoort niet bij T-021. Als de eigenaar het zelf toevoegde, mag het blijven staan, maar het komt dan mee in de commit van T-021.
- **Voorstel:** Neem `REQUIREMENTS.md` niet op in de commit van T-021, of laat de eigenaar bevestigen dat de wijziging van hem is en apart gecommit wordt.

## Opmerkingen zonder bevinding
- In crit. 7 van de brief staat "" als te weigeren waarde. Het plan laat een lege `size` echter weg via `recipes_normalize()`. De keuze staat in `docs/beslissingen.md:374`, en de db-test aanvaardt beide uitkomsten, maar geen van beide bewaart een lege waarde. Dat is aanvaardbaar.
- De unit tests voor crit. 7, 8 en 10 staan in `tests/unit/recipe-catalog.test.ts` in plaats van in `recipe.test.ts`, `recipeSize.test.ts` en `variant.test.ts` zoals de brief noemt. Inhoudelijk dekken ze de criteria.
