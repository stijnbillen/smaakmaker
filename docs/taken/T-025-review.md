# T-025 — review (ronde 3)

Bekeken: migratie `20261107120000_catalog_admin.sql` (hernoemd van `110000`, zodat ze na T-023 `20261107110000_bilingual_tags_equipment.sql` loopt; T-023 raakt `catalog_suggest` en `recipes_check_catalog_refs` niet), `catalogAdmin.ts`, `catalogAdminLogic.ts`, `CatalogAdminPage.tsx`, `CatalogItemEditor.tsx`, `App.tsx`, `ProfilePage.tsx`, `nl.json`/`fr.json`, `base.css`, `routes.ts`, `docs/beslissingen.md` en de drie testbestanden.

`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden:
- er zijn geen update- of delete-grants op de catalogustabellen;
- er is geen update-policy op `recipes` (de db-test controleert dat een beheerder het recept van een ander niet rechtstreeks kan wijzigen);
- beheer loopt alleen via `security definer`-functies met `is_admin()`;
- samenvoegen wijzigt alleen `ingredient_id`/`unit_id` (de db-test vergelijkt de rest van de rij);
- alle teksten staan in beide taalbestanden;
- er is geen service-key in de client.

Bevindingen 1–7 van ronde 2 zijn verwerkt:
- de e2e-test van crit. 3 vult de Franse naam in en controleert die in het recept in het `fr`;
- de e2e-test van crit. 4 controleert de lijst en het aantal, en na Annuleren de `ingredient_id`;
- de controles zijn exacte teksten;
- `too_many_synonyms` heeft een eigen `detail`;
- een lege naam bij "Bestaat al" toont de algemene foutmelding;
- de `unique_violation` bij gelijktijdige invoer wordt opgevangen en vastgelegd in `docs/beslissingen.md`.

De afwijking "40 items per keer, Toon meer" staat ook in `docs/beslissingen.md`. Ze raakt geen kernbeslissing.

## Bevindingen

### 1. tests/unit/catalogAdmin.test.ts:53-57 en tests/db/catalog-admin.test.ts:266: de nieuwe fout `too_many_synonyms` is niet getest
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Bij te veel synoniemen geeft `admin_merge_catalog` nu `detail = 'too_many_synonyms'`, en `mapCatalogError` maakt daar `tooManySynonyms` van. De interface leunt op dat onderscheid om `mergeTooMany` te tonen in plaats van `error.unknown`. De db-test controleert alleen de code `23514`. De unittest dekt de tak `tooManySynonyms` niet: alleen `23514` zonder detail wordt getest, en dat geeft `invalid`. Valt het detail weg, dan merkt geen enkele test het.
- **Voorstel:** Voeg in de db-test van het terugrollen `expect(res.error?.details).toBe('too_many_synonyms')` toe. Voeg in de unittest `mapCatalogError({ code: '23514', details: 'too_many_synonyms' })` → `tooManySynonyms` toe.

### 2. tests/e2e/catalog-admin.spec.ts:157-160: de controle "A staat niet meer in de lijst" slaagt al vóór de nieuwe zoekopdracht
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Na het samenvoegen staat er nog "qzvkbroccoli-doel" in het zoekveld, dus de lijst toont alleen rij B. `toHaveCount(0)` is daardoor al waar voordat het antwoord op de zoekterm "qzvkbrocolli-test" binnenkomt (die komt pas na een pauze van 300 ms). Een rij A die blijft staan, zou deze regel dus niet tegenhouden. De regel op 162 ("1 recept" bij B) en de controle in de databank dekken het herladen wel.
- **Voorstel:** Wacht eerst tot de lijst het resultaat voor de nieuwe term toont, bijvoorbeeld `await expect(row(page, 'qzvkbroccoli-doel').first()).toContainText('qzvkbrocolli-test')`, want A is nu een synoniem van B. Controleer pas daarna dat er geen rij zonder "qzvkbroccoli-doel" meer is.

### 3. tests/e2e/catalog-admin.spec.ts:163-168: "het recept toont broccoli" wordt niet in de interface gecontroleerd
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De taakbrief (crit. 4, *Test (e2e)*) vraagt dat het recept na het samenvoegen B toont. De test kijkt alleen in de databank of `ingredient_id` naar B wijst. Hoe een catalogusnaam in een recept verschijnt, is wel gedekt door de e2e-test van crit. 3 (de Franse naam).
- **Voorstel:** Open na het samenvoegen `/recept/${r}` en controleer dat er een lijstitem met "qzvkbroccoli-doel" staat.
