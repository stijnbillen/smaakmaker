# T-023 — review (ronde 3)

`CLAUDE.md` is niet gewijzigd. Ik zag geen kernbeslissing die geschonden wordt:
- De client krijgt geen schrijfrecht op `tags` of `equipment`; de test controleert dat met 42501.
- `merge_seeded_names()`, `merge_names_in_array()` en de resolvers zijn niet uitvoerbaar voor `anon` of `authenticated`.
- `equipment_choices()` is `security invoker` en alleen uitvoerbaar voor `authenticated`.
- Er komen geen nieuwe interfaceteksten bij.

Het antwoord in `VRAGEN.md` (startlijst kookgerief NL/FR) is gevolgd.

De bevindingen uit ronde 2 zijn opgelost:
- De sorteertest gebruikt nu kookplaat/oven tegenover four/plaque de cuisson, zowel in de unit-test als in de E2E.
- De migratietest hernoemt nu ook de rij naar "Oven" en controleert daarna `oven`/`four`.
- De kaart in het overzicht wordt getest op "four".
- De telling die altijd slaagde, is weg.
- De stille terugval in `useStoredNames` heeft nu een comment met het waarom.

Elk acceptatiecriterium van R-024 heeft minstens één test die faalt als het gedrag ontbreekt. Het zoeken op "pomme de terre" in beide talen staat in `tests/e2e/recipe-search-synonyms.spec.ts:69–72` (T-024).

## Bevindingen

### 1. src/lib/recipes.ts (git-index) — laag — ontwikkelaar
**Probleem:** `git status` toont `UU src/lib/recipes.ts`. Het werk is teruggezet met een `stash pop`, en dat gaf een conflict. In de werkkopie is het conflict opgelost: er staan geen conflictmarkeringen meer en de diff tegen HEAD behoudt de code van T-024. De index staat echter nog op "unmerged", en `stash@{1}` ("T-023 niet geslaagd") staat er nog. Een commit die alleen gestagede bestanden meeneemt, faalt of laat dit bestand weg.
**Voorstel:** markeer het bestand als opgelost met `git add src/lib/recipes.ts` vóór de commit. Verwijder daarna `stash@{1}`, want het werk zit nu in de werkkopie.

### 2. tests/e2e/bilingual-data.spec.ts:86–88 — laag — tester
**Probleem:** het comment zegt dat zoeken op "pomme de terre" "needs translated search (R-021, T-024), so it is not tested here". T-024 is intussen klaar en test dat al. Het comment is dus verouderd, en er staat niet bij waar die dekking dan wel zit.
**Voorstel:** verwijs in het comment naar `recipe-search-synonyms.spec.ts`, of voeg "pomme de terre" toe aan deze test.
