# T-016 — Review (R-012: Reviews)

Beoordeeld: de werkkopie tegen `31e451a` (migratie `20261102200000_reviews.sql`, `reviews.ts`, `reviewsApi.ts`, `StarRating`/`ReviewForm`/`ReviewSection`, `RecipeListPage`, `RecipeDetailPage`, `permissions.ts`, stijl/tokens, `nl.json`, de drie testbestanden en de wijziging in `a11y.spec.ts`).

`CLAUDE.md` is niet gewijzigd. Er is geen kernbeslissing geschonden: de rechten staan in RLS en kolomrechten, reviews staan in een eigen tabel buiten de receptrij, alle teksten staan in `nl.json` en de stijl gebruikt alleen tokens. `VRAGEN.md` heeft geen blok voor T-016.

Alle acceptatiecriteria hebben een test die echt iets controleert (databank, unit en interface). Ik vond geen bevinding met ernst hoog of middel.

## Bevindingen

### 1. Client en databank trimmen niet dezelfde tekens
- **Bestand:** `src/lib/reviews.ts:30` tegenover `supabase/migrations/20261102200000_reviews.sql:26`
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** `String.prototype.trim()` haalt ook Unicode-witruimte weg (NBSP, U+2028, …). `btrim(body, E' \t\r\n')` doet dat niet. Neem 500 tekens met een NBSP ervoor of erachter: de client keurt dat goed, maar de databank weigert met `23514`. De gebruiker ziet dan alleen "Opslaan mislukt." en niet "Hoogstens 500 tekens.".
- **Voorstel:** trim in de client alleen `[ \t\r\n]`, net als de trigger, bv. `body.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')`. Of trim in de trigger met dezelfde set als JS.

### 2. De teller telt vóór het trimmen
- **Bestand:** `src/components/ReviewForm.tsx:70`
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** de teller toont `[...body].length` zonder te trimmen. Een tekst van 500 tekens met spaties eromheen toont dus "504/500", terwijl hij wel opgeslagen wordt. Dat is verwarrend, maar het criterium wordt niet geschonden.
- **Voorstel:** tel in de teller op dezelfde manier als `validateReview` (na het trimmen).

### 3. Bewerken van een review die intussen verwijderd is
- **Bestand:** `src/components/ReviewSection.tsx:88-91`
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** verwijdert een beheerder de review terwijl de auteur ze bewerkt, dan geeft `updateReview` `NO_ROWS`. De gebruiker ziet "Opslaan mislukt.", maar de lijst laadt niet opnieuw. Hij blijft dus in een formulier voor een review die niet meer bestaat.
- **Voorstel:** laad bij `NO_ROWS` na een update de lijst opnieuw, zoals bij `duplicate`.

### 4. Leeg `<p>` bij een lege reviewlijst
- **Bestand:** `src/components/ReviewSection.tsx:150`
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** `ListState` met `emptyText=""` zet een lege `<p class="list-state">` in de pagina. Die neemt ruimte in onder "Nog geen reviews".
- **Voorstel:** toon de lijst alleen als `reviews.length > 0`, of laat `ListState` niets renderen bij een lege `emptyText`.

### 5. Sorteren samen met `overlaps`/`contains` niet getest in de databank
- **Bestand:** `tests/db/reviews.test.ts:200-212`
- **Ernst:** laag
- **Voor:** tester
- **Probleem:** criterium 5 (taakbestand) vraagt dat `order('rating_avg', { nullsFirst: false })` samenwerkt met `lte`, `overlaps` en `contains`. De test combineert de sortering alleen met `lte`. De volgorde op `rating_count` bij een gelijk gemiddelde wordt in de databanktest ook niet gecontroleerd; de e2e-test controleert die wel.
- **Voorstel:** voeg een `.overlaps(...)` en een `.contains(...)` toe op een tag- of geriefkolom, met een geval waarin twee recepten hetzelfde gemiddelde hebben.

### 6. Bestanden die niet bij de taak horen
- **Bestand:** `README.md`, `.env.example` (nieuw en niet gevolgd)
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** R-012 vraagt geen opstartdocumentatie. De bestanden zijn op zich onschuldig: `.env.example` bevat geen sleutel. Maar ze vallen buiten de scope en zouden ongemerkt mee in de commit van T-016 komen.
- **Voorstel:** laat ze uit deze commit, of leg in `docs/beslissingen.md` vast waarom ze erbij horen.

### 7. Afwijking van het plan: geen samenvatting bovenaan de detailpagina
- **Bestand:** `src/pages/RecipeDetailPage.tsx:191`, `docs/beslissingen.md` (T-016, bouw)
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** plan-stappen 9 en 10 vroegen een samenvatting onder de `AuthorLine` van het recept, en `rating_avg`/`rating_count` in `fetchRecipe`. Dat is niet gebouwd. De ontwikkelaar heeft dat vastgelegd en het criterium ("het recept toont …") wordt gehaald door de reviewsectie. Gevolg: op een gsm staat het gemiddelde pas onderaan de pagina.
- **Voorstel:** zo laten, of de eigenaar laten kiezen bij R-016 (ontwerp). Er is geen actie nodig voor deze taak.
