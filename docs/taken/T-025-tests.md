# T-025 — tests

Bestanden: `tests/db/catalog-admin.test.ts`, `tests/unit/catalogAdmin.test.ts`, `tests/e2e/catalog-admin.spec.ts`, route `/databank` (admin) toegevoegd in `tests/e2e/routes.ts` (dekt layout 360 px en a11y, ook in het Frans via de bestaande specs).

`npx tsc --noEmit`: enige fout is de ontbrekende module `src/lib/catalogAdminLogic` (testnaad, zie hieronder).

## Testnaad voor de ontwikkelaar
`src/lib/catalogAdminLogic.ts` (zonder Supabase-import) met:
- `validateCatalogItem(kind: 'ingredient'|'unit', { nameNl, nameFr, synonyms })` → `null | 'noName' | 'nameTooLong' | 'synonymTooLong' | 'tooManySynonyms' | 'duplicateKey'`
- `mapCatalogError({ code?, details?, message? })` → `{kind:'exists', itemId} | {kind:'inUse', count} | {kind:'invalid'} | {kind:'forbidden'} | {kind:'unknown'}`

DB-contract dat de tests aannemen: `p_kind` is `'ingredient'|'unit'`; `admin_list_catalog` geeft `use_count` en `synonyms`; `23505` met het id in `details`; `23503` met het aantal in `details`; `22023` bij samenvoegen met zichzelf.

## E2E-aannames (UI-selectors)
Brief geeft geen aria-namen. Aangenomen: link/kop "Ingrediënten en eenheden"; tabs "Ingrediënten"/"Eenheden" (`role=tab`); zoekveld `searchbox` of textbox met naam "zoek"/"cherch"; item openen door tikken op het `listitem`; veld met naam "synoni…", knoppen "toevoegen"/"opslaan", "Samenvoegen", "Verwijderen", "Annuleren"; keuze van B als `option` of `listitem`; bevestiging in `role=dialog`. Past de UI anders, dan pas ik de selectors aan in een volgende ronde (de ontwikkelaar mag de namen ook volgen).

## Gedekt
- Crit. 1: e2e (link, redirect). 
- Crit. 2: db (typfout, tel per recept eenmalig, eenheden, Franse naam/synoniem, lege term alfabetisch, geen grens 5); e2e (zoeken, tabblad Eenheden).
- Crit. 3: db (synoniem → exacte treffer, 23505 + id + niets gewijzigd, 23514 voor lege/te lange namen en >20 synoniemen, Franse naam); e2e nl + fr melding; unit validatie en foutomzetting.
- Crit. 4: db (twee auteurs, sleutels naar B, A weg, rest ongewijzigd, eenheden, A in A, terugrollen bij >20 synoniemen met voor/na-vergelijking); e2e (annuleren, bevestigen).
- Crit. 5: db (ongebruikt verwijderen + sleutels weg, 2 recepten → 23503 met 2, eenheid); e2e (beide talen, verdwijnt na bevestiging).
- Crit. 6: db (user en anon op alle vier functies, 42501 voor user; directe update/delete op vier tabellen voor user en admin; admin kan recept van ander niet direct wijzigen).
- Crit. 7: db (`huge` geweigerd, geen formaat-tabel/-functie); e2e (geen formaattabblad).
- Algemeen: layout/a11y via routes.ts; i18n-test bestaat al.

## Niet gedekt
- Gelijktijdigheid (`for update`/`key share`, `23503` bij gelijktijdig opslaan): vraagt twee parallelle transacties; niet betrouwbaar met supabase-js. Bewust weggelaten.
- Terugrollen bij een oud recept dat een `not valid`-check faalt: niet deterministisch op te zetten zonder triggers uit te zetten; weggelaten.
- Zoekdrempels van R-019 in `admin_list_catalog` (DL, trigram, volgorde): gedeelde logica met `catalog_suggest`, al gedekt door `catalog-suggest.test.ts`; hier alleen typfout, prefix-onafhankelijk gedrag en geen grens.
- Pauze van 300 ms en "alleen het laatste antwoord telt" in de UI: niet getest.
## Herstel review
- Bevinding 1: e2e toegevoegd (Franse naam invullen, lijst toont hem, recept in `fr` toont hem).
- Bevinding 2: e2e controleert na annuleren `ingredient_id` ongewijzigd, na bevestigen A weg uit de lijst en "1 recept" bij B.
- Bevinding 3 en 4: exacte Franse tekst, "2 recepten", exacte eenheidsnaam "el".

## Herstel testfouten (door ontwikkelaar gemeld)
- `dialog` -> `alertdialog` (ConfirmDialog).
- FR-synoniemselector `/synoni|synonym/i`.
- Crit. 3: elke taalvariant eigen item (`qzvktomaat<lang>`), geen gedeelde staat.
- Crit. 4: databankcontrole met `expect.poll` na samenvoeging.
