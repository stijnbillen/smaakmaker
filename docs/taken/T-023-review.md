# T-023 — review (ronde 4, na de mislukte eindcontrole)

`CLAUDE.md` is niet gewijzigd. Ik zag geen kernbeslissing die geschonden wordt:
- De client krijgt geen schrijfrecht op `tags` of `equipment`; de test controleert dat met 42501.
- `merge_seeded_names()`, `merge_names_in_array()` en de resolvers zijn niet uitvoerbaar voor `anon` of `authenticated`.
- `equipment_choices()` is `security invoker` en alleen uitvoerbaar voor `authenticated`.
- `nl.json` en `fr.json` zijn niet gewijzigd; er komen geen nieuwe interfaceteksten bij.

Het antwoord in `VRAGEN.md` (startlijst kookgerief NL/FR, optie 1) is gevolgd. De lijst in de migratie is gelijk aan die in het antwoord en aan R-024 crit. 3.

Wat er sinds ronde 3 veranderde:
- De migratie heet nu `20261107110000_…`, omdat `20261107100000` al door T-024 gebruikt wordt. Die volgorde (eerst T-024, dan T-023) is in `docs/beslissingen.md` vastgelegd.
- `merge_seeded_names()` maakt `name_fr` eerst leeg, zodat het opnieuw uitvoeren (in de migratietest) niet stukloopt op de sleutel-trigger.
- De bevinding over `src/lib/recipes.ts` uit ronde 3 is opgelost: het bestand staat nu gestaged (`M `), niet meer als `UU`, en `stash@{1}` is weg. Alleen `stash@{0}` (T-025) staat er nog, en dat is een andere taak.

Elk acceptatiecriterium van R-024 heeft minstens één test die faalt als het gedrag ontbreekt:
- crit. 1: `tests/e2e/bilingual-data.spec.ts:49–83`, en voor het zoeken op "pomme de terre" `tests/e2e/recipe-search-synonyms.spec.ts:69–72`;
- crit. 2: de DB-test en de E2E-test;
- crit. 3: de DB-test, inclusief de samenvoegtest met "Oven", "Four" en dubbele namen, en de E2E-test;
- crit. 4 tot en met 7: telkens unit-, DB- en E2E-tests.

De DB-tests passen de gedeelde catalogus tijdelijk aan, maar dat geeft geen botsing tussen testbestanden, want `vitest.config.ts` zet `fileParallelism: false`.

## Bevindingen

### 1. tests/e2e/bilingual-data.spec.ts:87 — laag — tester
**Probleem:** dit staat er nog uit ronde 3. Het comment zegt dat zoeken op "pomme de terre" "needs translated search (R-021, T-024), so it is not tested here". T-024 is klaar en test dat al in `recipe-search-synonyms.spec.ts:69–72`. Het comment is dus verouderd en zegt niet waar die dekking wel zit.
**Voorstel:** verwijs in het comment naar `tests/e2e/recipe-search-synonyms.spec.ts`.
