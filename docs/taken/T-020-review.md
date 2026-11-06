# T-020 — Review (R-019 Woordnabijheid en suggesties)

Bekeken: `supabase/migrations/20261106130000_catalog_suggest.sql`, `src/lib/suggest.ts`, `src/lib/recipes.ts` (`fetchSuggestions`), `tests/db/catalog-suggest.test.ts`, `tests/unit/suggest.test.ts`, `docs/beslissingen.md`, `docs/taken/T-020*.md`. In `VRAGEN.md` staat geen blok voor T-020.

`CLAUDE.md` is niet gewijzigd. De taak schendt geen kernbeslissing. Rechten zitten in de databank: `anon` heeft geen `execute`, en de interne en pure functies zijn niet via `/rpc` aan te roepen. Er komen geen geheime sleutels in de client en geen zichtbare teksten bij. De wrappers en `catalog_suggest` zijn `security definer`, terwijl de brief `invoker` vroeg. Die afwijking staat in `docs/beslissingen.md`. Ze lekt niets, want de policies op `ingredients`, `units`, `ingredient_keys` en `unit_keys` zijn `using (true)` voor `authenticated` (`20261106100000_catalog.sql:152-157`), en de wrappers weigeren zonder `auth.uid()`.

Elk acceptatiecriterium van R-019 is gehaald en door een test gedekt. De grenstests van afstand en trigram controleren eerst de andere maat, zodat ze niet per toeval slagen. Crit. 9 is met nep-timers getest op de loader; de test met echte toetsaanslagen (Playwright) volgt met het formulier.

## Bevindingen

### 1. `src/lib/suggest.ts:2` — laag — ontwikkelaar
**Probleem:** de comment zegt "the RPC call lives in suggestApi.ts". Dat bestand bestaat niet; `fetchSuggestions` staat in `src/lib/recipes.ts`. Wie T-021 bouwt, zoekt dan op de verkeerde plek.
**Voorstel:** verwijs naar `recipes.ts`.

### 2. `src/lib/suggest.ts:55-57` — laag — ontwikkelaar
**Probleem:** bij een mislukte `fetch` blijven de vorige suggesties staan. Die horen bij een eerdere invoer, terwijl R-019 vraagt dat het scherm de suggesties voor de laatste invoer toont. Nu speelt dit niet, want `fetchSuggestions` werpt niets op en geeft bij een fout `rows: []`. Maar een `fetch` die wel opwerpt, laat oude suggesties staan.
**Voorstel:** roep in de `catch` (alleen als `mine === seq`) `onResult([])` aan, of leg in de comment vast dat `fetch` nooit mag opwerpen.

### 3. `tests/db/catalog-suggest.test.ts:136, 195, 212, 240, 281, 299, 315, 323, 331, 339, 390` — laag — tester
**Probleem:** `removeItems()` staat aan het eind van de test, niet in een `finally` of `afterEach`. Faalt een `expect` eerder, dan blijven de testitems (`qzvk…`) staan tot `afterAll`. De volgende tests met dezelfde term (`qzvkwj`, `qzvkw`) krijgen dan extra kandidaten en falen als gevolgfout. Zo wordt de eerste, echte fout moeilijk te vinden.
**Voorstel:** `afterEach(removeItems)` in de `describe`.
