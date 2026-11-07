# T-025 — review

Bekeken: migratie `20261107110000_catalog_admin.sql`, `catalogAdmin.ts`, `catalogAdminLogic.ts`, `CatalogAdminPage.tsx`, `CatalogItemEditor.tsx`, `App.tsx`, `ProfilePage.tsx`, `nl.json`/`fr.json`, `base.css`, de drie testbestanden en `routes.ts`.

`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden: geen update- of delete-grants op de catalogustabellen, geen update-policy op `recipes`, het beheer loopt alleen via `security definer`-functies met `is_admin()`, en samenvoegen raakt in recepten van anderen alleen `ingredient_id`/`unit_id` (de db-test vergelijkt de rest byte voor byte). Er is een migratie, en de teksten staan in beide taalbestanden.

## Bevindingen

### 1. tests/e2e/catalog-admin.spec.ts:95-114: geen e2e voor "Franse naam invullen, recept toont die meteen"
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** De taakbrief (crit. 3, *Test (e2e)*) vraagt: "De Franse naam van een item invullen werkt, en een recept met dat item toont de nieuwe naam in het Frans meteen (R-020 crit. 9)." Die test ontbreekt. De e2e van crit. 3 dekt alleen de melding "Bestaat al bij". Het pad in de interface om een naam aan te passen en op te slaan (velden `Nederlandse naam`/`Franse naam`, knop Opslaan, `onSaved` en herladen) is nergens getest. De db-test op regel 223-228 controleert alleen de RPC.
- **Voorstel:** Maak een item met alleen een Nederlandse naam en een recept dat ernaar verwijst. Vul in de pagina de Franse naam in en sla op. Controleer dat de lijst de nieuwe naam toont, en open daarna het recept met taal `fr` en controleer dat de nieuwe Franse naam er staat.

### 2. tests/e2e/catalog-admin.spec.ts:131-141: samenvoegen wordt alleen in de databank gecontroleerd, niet in de interface
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** De brief (crit. 4, *Test (e2e)*) vraagt dat het item uit de lijst verdwijnt, dat het aantal bij B stijgt en dat het recept B toont. De test kijkt alleen met SQL of A weg is en of `ingredient_id` naar B wijst. Een interface die na het samenvoegen niet herlaadt, of een verkeerd aantal toont, valt zo niet op. Ook na "Annuleren" controleert de test alleen de databank, niet dat er geen recept is omgezet.
- **Voorstel:** Controleer na het bevestigen dat `row(page, 'qzvkbrocolli-test')` het aantal 0 heeft en dat de rij van B "1 recept" toont. Controleer na "Annuleren" ook dat `ingredient_id` in het recept nog A is. Open eventueel het recept en controleer dat de naam van B er staat.

### 3. tests/e2e/catalog-admin.spec.ts:150: Franse melding "in gebruik" alleen met een regex
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De reden in `T-025-tests.md` ("`fr.json` bestaat nog niet voor deze sleutels") geldt niet meer. `/utilisé.*2 recettes/i` aanvaardt ook een onvolledige of verkeerde zin.
- **Voorstel:** Vergelijk met de exacte tekst "Utilisé dans 2 recettes ; fusionnez-le avec un autre élément.".

### 4. tests/e2e/catalog-admin.spec.ts:87 en 90-92: zwakke controles
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** `toContainText('2')` slaagt bij elke 2 in de rij, niet alleen bij het aantal. `row(page, 'el')` treft elk lijstitem dat "el" bevat, en controleert dus niet dat het item "el" zelf getoond wordt.
- **Voorstel:** Controleer `toContainText('2 recepten')`. Zoek in het tabblad Eenheden een rij met de exacte naam (bv. `getByText('el', { exact: true })`).

### 5. src/pages/CatalogAdminPage.tsx:113: elke `23514` bij samenvoegen geeft "Te veel synoniemen"
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Bij `admin_merge_catalog` komt `23514` ook van een recept dat bij het bijwerken een check niet haalt. Dat risico staat in de taakbrief zelf ("Oude proefrecepten en `not valid`-checks"). De beheerder krijgt dan een verkeerde uitleg en gaat synoniemen verwijderen zonder dat dat helpt.
- **Voorstel:** Laat de functie het aantal synoniemen van B na samenvoegen vooraf controleren en een herkenbare fout geven (bv. `23514` met `detail = 'too_many_synonyms'`). Toon `mergeTooMany` alleen bij die fout en `error.unknown` bij elke andere fout.

### 6. src/components/CatalogItemEditor.tsx:66-68 / src/lib/catalogAdmin.ts:84: "Bestaat al bij ." met een lege naam
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `fetchItemName` geeft `''` terug als het andere item intussen weg is of als de query faalt. De melding wordt dan "Bestaat al bij .".
- **Voorstel:** Toon bij een lege naam de algemene foutmelding, of laad de lijst opnieuw.

### 7. supabase/migrations/20261107110000_catalog_admin.sql:650-661: botsing door gelijktijdige invoer wordt "onbekende fout"
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De voorcontrole van de sleutels neemt geen slot. Voegt een gebruiker tegelijk een item toe met dezelfde sleutel, dan faalt `catalog_sync_keys` met `23505` zonder `detail`. `mapCatalogError` maakt daar `unknown` van. Er gaan geen gegevens verloren: alles rolt terug.
- **Voorstel:** Vang in `admin_update_catalog` de `unique_violation` van de update op, zoek de eigenaar van de sleutel op en geef die opnieuw met het id in `detail`. Of aanvaard dit gedrag en noteer het in `docs/beslissingen.md`.
