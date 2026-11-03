# T-011 — review

Bekeken: migratie `20261102180000_recipe_trait_tags.sql`, wijzigingen in `src/` (recipe.ts, recipes.ts, tags.ts, tagFilter.ts, RecipeForm, RecipeListPage, RecipeDetailPage, nl.json), tests (`tests/db/recipe-trait-tags.test.ts`, `tests/e2e/recipe-trait-tags.spec.ts`, `tests/unit/recipe.test.ts`, `tests/unit/tagFilter.test.ts`, `tests/helpers/recipe-form.ts`), `docs/beslissingen.md`.

Acceptatiecriteria R-011:
- Crit. 1 (aparte groep "Kenmerken", eigen startlijst, zelfde naam in beide groepen): gedekt in db (startlijst, nul of meer, 20/21, per groep, rechten, hergebruik, gelijktijdig, `snack` in beide groepen, `42501`), unit en e2e.
- Crit. 2 (filters combineren): gedekt in unit (twee `overlaps` op dezelfde builder), db (doorsnede) en e2e (A–D, URL, herladen, snelle tikken, tijdfilter).
- Crit. 3 (vegetarisch alleen via tag): gedekt in e2e (E met spek + tag, F zonder tag) en unit (nep-builder heeft alleen `overlaps`, elke andere aanroep zou falen).

Kernbeslissingen: niet geschonden. `CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Catalogus blijft voor de client alleen leesbaar, de triggerfunctie is niet uitvoerbaar voor de client, `trait_tags` valt onder de bestaande update-policy (alleen de auteur). Nieuwe teksten staan in `nl.json`. Geen schemawijziging zonder migratie.

## Bevindingen

### 1. Exacte startlijst-test is gevoelig voor restanten van een afgebroken run
- **Bestand:** `tests/db/recipe-trait-tags.test.ts:65-68`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de test eist dat `kind = 'trait'` precies de negen starttags bevat. De e2e-tests (`recipe-trait-tags.spec.ts:212-228`, `:374-382`) en deze databanktest zelf maken trait-tags aan in de catalogus, en die worden pas in `afterAll` opgeruimd. Breekt een run af vóór `afterAll` (crash, timeout, Ctrl+C), dan blijven er rijen staan en faalt deze test bij elke volgende run tot iemand `supabase db reset` doet. Dat is een vals rood, geen fout in de code.
- **Voorstel:** controleer dat elke naam uit de startlijst er precies één keer is, en dat er geen andere rijen zijn behalve namen die op een testpatroon lijken. Of maak het lokale testverloop expliciet afhankelijk van `supabase db reset` en zet dat in de testnotities.

### 2. Ongevolgde bestanden horen niet bij deze taak
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** deze twee bestanden staan ongevolgd in de werkmap. Ze stonden er al bij T-010 en horen niet bij T-011 (zie `docs/beslissingen.md`, T-010-bouwnotities). Een savepoint met `git add -A` zou ze in de commit van T-011 opnemen.
- **Voorstel:** neem ze niet op in de commit van T-011. De eigenaar beslist over een aparte commit.
