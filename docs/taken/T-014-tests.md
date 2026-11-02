# T-014 — tests (R-006 Varianten)

Bestanden: `tests/unit/variant.test.ts`, `tests/unit/recipe.test.ts` (uitbreiding `isDirty` + `copyFrom`), `tests/db/variants.test.ts`, `tests/e2e/variants.spec.ts`, `tests/e2e/routes.ts` (route `variant maken`), helpers `copyPhotos` en `insertVariant` in `tests/helpers/supabase-admin.ts`.

## Gedekt
- Crit. 1: unit (`variantDraft`), db (insert eigen auteur / vreemde auteur geweigerd), e2e (knop, alle velden, 2 foto's, auteur B, eigen bestanden, zelfde hoofdfoto).
- Crit. 2: unit (`isDirty`), e2e (weggooien, direct verlaten, geen recepten/bestanden erbij). Opruiming na weigering: e2e van crit. 3 (lege map) en `sourceGone`.
- Crit. 3: db (grens +1 → 23514 / recipe_too_large / photos; exact grens ok), e2e (teller gelijk, weigering door databank, client-controle vóór kopiëren).
- Crit. 4: db (B kopieert foto's van A met eigen sessie, eigenaar = B), e2e (knop voor auteur en beheerder).
- Crit. 5–7, 9, 11: e2e met keten A→B→C + D, verwijderde bron, label, 44 px-samenvatting. Unit voor `familyView`, `variantSourceLine`, `isVariant`.
- Crit. 8: db (update bron, delete bron + bestanden), e2e (foto's blijven).
- Crit. 9–10: db (set null, admin-delete, family_id blijft; eigen bron, onbekende bron, kolomrechten 42501, trigger voor service-rol incl. kring, null toegelaten, client-family_id genegeerd).
- i18n-sleutels (unit), route in `routes.ts`, verbindingsbanner, `sourceGone`, "Recept niet gevonden.".

## Niet / beperkt gedekt
- Contrast van het label en `no-hardcoded-styles`: lopen via de bestaande generieke tests; geen eigen test.
- Eigenaar van gekopieerde bestanden: de db-test bewijst het; faalt hij, dan is de terugval (download + upload) nodig (risico in de brief).
- Aannames over nog niet bestaande code: `src/lib/variant.ts` met `variantDraft(record, sizes)`, `familyView(members, currentId)` (leden `id,title,variant_of,created_at,author:{display_name}`, resultaat `{direct, all, n}`), `variantSourceLine(variantOf, familyId, id, sourceTitle)` → `'bron'|'verwijderd'|'geen'`, `isVariant({id, family_id})`; `PhotoDraft.copyFrom`; testid `variant-label`; "Alle varianten (n)" als `<details>/<summary>`; "Varianten" als kop met links.
- `tsc` faalt nu alleen op het ontbrekende `src/lib/variant.ts` (testnaad voor de ontwikkelaar) en de impliciete-`any`-fouten die daaruit volgen.
- db- en e2e-tests zijn niet gedraaid: ze hangen af van de migratie en de UI van de ontwikkelaar.

## Herstel (na melding ontwikkelaar)
- Tags in test 1 nu lowercase (`soep`, `vegetarisch`, `snel`, `winter`), zoals de app opslaat.
- Familielijst: `getByText(title, {exact:true})`; lijstitem-filter case-sensitive regex, zodat "Kleinkind" niet matcht.
- Tagcontrole in test 1 (crit. 1): knop-naam nu hoofdletterongevoelig (regex `^naam$`, `i`) binnen de tagroep, omdat de gedeelde catalogus ook "Vegetarisch" kan bevatten. Getoetst gedrag (tag gekopieerd en geselecteerd, `aria-pressed=true`) ongewijzigd; import `tagButton` → `tagGroup`.
- Foto-test: `naturalWidth` vervangen door HTTP 200-check op de afbeeldings-URL (fixture niet decodeerbaar). Criterium (variant houdt eigen foto na verwijderen bron) blijft gedekt.
