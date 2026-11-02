# T-014 — review ronde 2 (R-006 Varianten)

`CLAUDE.md` is niet gewijzigd. Er is geen kernbeslissing geschonden. De migratie `20261103110000_recipe_variants.sql` vult `family_id` voor bestaande rijen voordat de kolom `not null` wordt, en ze wist niets.

## Stand van de bevindingen uit ronde 1
- **1 (middel, ontwikkelaar): hersteld.** `createRecipe` (`src/lib/recipes.ts:180-187`) ruimt bij een kopieerfout de al gemaakte kopieën op via `discardAfterFailure`. Bij een verbindingsfout gebeurt dat niet. Daarna controleert `sourceMissing` of de bron nog bestaat en geeft dan `sourceGone` terug. Een mislukte leesactie telt niet als "verwijderd".
- **2 (middel, tester): hersteld.** De controle op regel 412-413 is nu onvoorwaardelijk. Er is een nieuw geval bijgekomen waarin de rij én de bestanden verwijderd worden (`tests/e2e/variants.spec.ts:416-439`).
- **3 (middel, ontwikkelaar): hersteld.** `playwright.config.ts` bevat geen `retries` meer en is niet gewijzigd tegenover de vorige commit.

## Nieuwe bevindingen

### 1. De opruimstap na een gedeeltelijk mislukte kopie is niet getest
- **Plaats:** `tests/e2e/variants.spec.ts:416-439`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De test verwijdert alle bestanden van de bron. Daardoor faalt al de eerste `copy` en is `up.fresh` leeg. Haal je de regel `discardAfterFailure` op `src/lib/recipes.ts:182` weg, dan slaagt de test nog steeds. Het geval waarvoor die regel geschreven is (foto 1 gekopieerd, foto 2 faalt), wordt dus niet getoetst.
- **Voorstel:** Voeg een geval toe waarin alleen de 2e kopie faalt. Dat kan met `page.route` op `**/storage/v1/object/copy`: laat het eerste verzoek door en beantwoord het tweede met `route.fulfill({ status: 400 })`. Controleer daarna dat de doelmap leeg is.

### 2. Een foto die uit de bron verdwijnt, blokkeert het opslaan met een algemene melding
- **Plaats:** `src/lib/recipes.ts:183-186`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Verwijdert de auteur van de bron een foto terwijl het variantformulier open staat, dan bestaat de bron nog, maar faalt de `copy` van die foto. De gebruiker krijgt dan "Opslaan mislukt." Elke nieuwe poging faalt op dezelfde manier, en niets zegt hem dat hij die foto uit het formulier moet halen.
- **Voorstel:** Geen herstel nodig in deze taak. Noteer het in `docs/beslissingen.md` als aanvaard randgeval, of toon een eigen melding wanneer de kopie faalt terwijl de bron nog bestaat.

## Gecontroleerd zonder bevinding
- **Criteria 1-11:** gedekt door de unit-, databank- en e2e-tests. Zie ook de review van ronde 1. De wijzigingen in deze ronde raken die criteria niet.
- **Scope:** er is geen extra scope tegenover ronde 1.
