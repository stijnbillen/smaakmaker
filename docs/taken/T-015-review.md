# T-015 — review (tweede poging, ronde 4)

Beoordeeld: de werkmap tegen `f3056e8`, met de nieuwe bestanden erbij: migratie `20261103120000_recipe_search.sql`, `src/lib/ingredientSearch.ts`, `src/components/IngredientSearch.tsx` en de drie testbestanden. Ook de wijzigingen in `RecipeListPage.tsx`, `nl.json` en `base.css`. `docs/beslissingen.md` is al gecommit in `231a717`. De laatste build in `docs/loop-log.md` (21:47) is geslaagd.

`CLAUDE.md` is niet gewijzigd en er wordt geen kernbeslissing geschonden:
- `security invoker` met `revoke` voor `anon`;
- teksten in `nl.json`;
- stijl alleen met tokens;
- geen sleutels in de client.

`VRAGEN.md` heeft geen blok voor T-015.

## Stand van de bevindingen uit ronde 3
- **Bevinding 1** (één term telt hoogstens één keer): hersteld in `tests/db/recipe-search.test.ts:117-130`.
  - De ingrediënten `feta${s}` en `feta${s} blokjes` bevatten nu allebei de term. De test verwacht `match_count = 1` en `term_count = 2`, dus een telling per ingrediënt laat hem falen.
  - Het geval met k = 2 (geen treffer) is erbij gekomen.
- **Bevinding 2** (README.md en .env.example): blijft open, zie hieronder.

## Bevindingen

### 1. Bestanden van een andere taak in de werkmap
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** volgens de brief horen deze bestanden bij T-012 en niet bij deze taak.
- **Voorstel:** commit ze niet onder T-015, of vermeld ze apart in de commitboodschap.

### 2. Verouderde regel in de beslissingen
- **Bestand:** `docs/beslissingen.md:271`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** de regel zegt dat de client sorteert op "`match_count`, dan `created_at`". Regel 273 beschrijft de echte volgorde: met de sorteerkeuze "Beoordeling" komt de beoordeling ertussen. De twee regels spreken elkaar tegen.
- **Voorstel:** schrap regel 271 of verwijs ze naar regel 273.

### 3. Geen zoekvariant in de gedeelde lay-outcontrole
- **Bestand:** `tests/e2e/routes.ts`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de brief (plan, stap 7) vraagt een route met zoekparameters in de gedeelde controle op 360 px, "als de lijst dat toelaat". `recipe-search.spec.ts:483-501` controleert de breedte op 360 px wel zelf. Dekking ontbreekt dus niet, alleen de plek wijkt af van de brief.
- **Voorstel:** voeg `/?met=feta&met=tomaat&min=1` toe aan `routes.ts`, of laat het zo en vermeld het in `T-015-tests.md` (dat gebeurt al onder "Niet gedekt").

## Gecontroleerd zonder bevinding
- **Migratie:**
  - De termen gaan eerst door `fold_key`. Daarna vallen lege sleutels weg en wordt er ontdubbeld, en pas dan geldt de grens van 10.
  - `strpos` behandelt `%` en `_` als gewone tekens.
  - `exists` per term zorgt dat een term hoogstens één keer telt.
  - `not exists` regelt "zonder".
  - k valt terug op n als er geen minimum is. Bij n = 0 komt er geen fout.
  - Een `ingredients` die geen array is, geeft geen crash.
  - Rechten: `security invoker`, en `anon` heeft geen execute-recht. De migratie eindigt met `notify pgrst`.
- **Pagina:**
  - Bij "alle" gaat `p_min = null` mee.
  - De volgorde is `match_count`, dan de beoordeling (`nullsFirst: false`), dan `created_at`.
  - Zonder zoektermen blijft de bestaande query.
  - `requestId` houdt late antwoorden tegen.
  - Bij een andere zoekopdracht wordt de lijst eerst leeggemaakt.
  - "k van n" komt uit `term_count` en staat alleen bij `termCount > 0`.
  - `emptyText` houdt rekening met `hasSearch`.
- **Component:**
  - De sync met de URL loopt via `lastEmitted`/`inFlight`.
  - Knop en Enter annuleren de debounce.
  - "Alle" schuift mee met n, een vaste k blijft staan.
  - Een k groter dan de nieuwe n valt via `toSearchParams` terug op "alle".
- **Tests:**
  - De unit-tests dekken:
    - `parseTerms` en `clampMin`;
    - `parseSearch`, met ontdubbelen en klemmen;
    - `toSearchParams`, met `sorteer` behouden en "alle" zonder `min`;
    - de debounce met nep-timers;
    - de sleutels in `nl.json`.
  - De databanktests dekken criteria 1 tot en met 5, 8 (`lte`, `overlaps`, `order`) en 9, plus de anonieme aanroep.
  - De e2e-tests voor de pauze (299/101 ms), de knop en Enter laten de klok echt stilstaan.
  - De e2e-test voor late antwoorden blokkeert de service worker en bewijst de vertraging.
  - Deze e2e-tests zijn aanwezig en kunnen falen:
    - sorteren op beoordeling bij een gelijke `match_count`;
    - de filtercombinaties, ook alle samen met herladen;
    - de URL van buitenaf (link naar `/`, terug);
    - typen zonder sprong;
    - de verbindingsfout;
    - tikdoelen en breedte op 360 px.
- **Favorieten** (criterium 8): volgens de brief gaat dat naar T-017. De RPC geeft `id` terug en zit in een gewone filterketen.
