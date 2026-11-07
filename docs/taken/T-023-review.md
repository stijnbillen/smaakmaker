# T-023 — review

`CLAUDE.md` is niet gewijzigd. Ik zag geen kernbeslissing die geschonden wordt: de client krijgt geen schrijfrecht op `tags` of `equipment` (getest met 42501), `merge_seeded_names()` en de resolvers zijn niet uitvoerbaar voor `anon` of `authenticated`, en `equipment_choices()` is `security invoker`. Er komen geen nieuwe interfaceteksten bij. Het antwoord in `VRAGEN.md` (startlijst kookgerief NL/FR) is gevolgd.

## Bevindingen

### 1. tests/e2e/bilingual-data.spec.ts:236–242 — middel — tester
**Probleem:** de test "equipment choices: four before mijoteuse in French" slaagt ook als `EquipmentChoices` helemaal niet sorteert. `equipment_choices()` geeft de rijen al gesorteerd op `name_key` terug (oven < slowcooker), en die volgorde is in beide talen dezelfde. Het criterium van de taak, "de volgorde van de kookgerief-keuzes wisselt mee met de taal" (crit. 7, E2E), is dus niet gedekt. De unit-test op tests/unit/bilingual-data.test.ts:62–67 verwacht ook in beide talen dezelfde volgorde, en bewijst daarom geen wissel.
**Voorstel:** neem een paar waarvan de volgorde omdraait, bv. kookplaat/plaque de cuisson en oven/four. In het Nederlands staat "kookplaat" vóór "oven", in het Frans "four" vóór "plaque de cuisson". Controleer dat in de E2E in beide talen, en in de unit-test van `sortByShownName` voor kookgerief.

### 2. tests/db/bilingual-data.test.ts:212–245 — laag — tester
**Probleem:** de migratietest zet alleen de recept-arrays op "Oven". Er komt geen kookgerief-rij met de spelling "Oven" (de rij `oven` bestaat al). De tak in `merge_seeded_names()` die een bestaande rij hernoemt (`update public.equipment set name = r.nl where name_key = … and name <> r.nl`) wordt dus niet uitgevoerd. Precies dat geval noemt de requirement ("bv. 'Oven'").
**Voorstel:** zet in hetzelfde replica-blok ook `update public.equipment set name = 'Oven' where name_key = 'oven'`. Controleer daarna dat de rij weer `oven` heet, met `name_fr = 'four'`.

### 3. src/components/RecipeBrowser.tsx:297 — laag — tester
**Probleem:** de kookgerieflabels op de kaart in het overzicht tonen nu `shownName`, maar geen test controleert dat. Een recept met "oven" moet in het Frans "four" tonen op de kaart.
**Voorstel:** voeg in crit. 5 (fr) een controle toe: `item(page, title).getByTestId('recipe-equipment')` bevat "four".

### 4. tests/db/bilingual-data.test.ts:158–159 — laag — tester
**Probleem:** `expect(after).toBeGreaterThanOrEqual(before)` slaagt altijd en controleert niets. Het echte bewijs dat er geen rij bijkomt, is de query op `name_key = 'soupe'` daarna.
**Voorstel:** schrap de telling, of zet er een comment bij dat alleen de sleutelquery telt.

### 5. src/lib/useStoredNames.ts:27–29 — laag — ontwikkelaar
**Probleem:** als de catalogus niet laadt, toont de detailpagina in het Frans zonder melding de Nederlandse namen. De andere lijsten melden een laadfout via `report`/`resolve`.
**Voorstel:** meld de fout via `useConnection().report`, met een eigen sleutel en een nieuwe poging, zoals `TagFilter`. Of leg in een comment uit waarom stil terugvallen hier goed genoeg is.

### 6. tests/e2e/bilingual-data.spec.ts:87–103 — laag — tester (ter info)
**Probleem:** `docs/taken/T-023.md` vroeg ook om te zoeken op "pomme de terre". Dat is weggelaten en de reden staat in `T-023-tests.md`: het hoort bij R-021/T-024. De tekst van R-024 crit. 1 vraagt alleen om de weergave in het overzicht, en de kaart toont geen ingrediëntnamen. De afwijking is dus te verdedigen. De lus `for (const term of ['aardappel'])` is daardoor overbodig geworden.
**Voorstel:** neem bij T-024 de zoekterm "pomme de terre" weer op, zoals `T-023-tests.md` aankondigt.
