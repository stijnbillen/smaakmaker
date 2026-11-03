# T-010 — review (ronde 3, na blokkade "eindcontrole faalt")

`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden:
- Rechten in de databank: `tags` alleen `select` voor `authenticated`, schrijven alleen via `resolve_tags()` (`security definer`, `execute` ingetrokken voor de client). Update-policy op `recipes` ongewijzigd, alleen `grant update (dish_tags)`.
- Validatie in de databank (trimmen, 1–30 tekens, max. 20, hergebruik via `unique (kind, name_key)`), ook bij directe API-aanroep.
- Teksten in `nl.json`; identifiers en commentaar Engels; stijl hergebruikt bestaande token-klassen (`.choice`, `.inline-add`, `.equipment-tags`).

Werkkopie staat nu op de basis mét T-009. `fold_key` bestond al in `20261102160000_recipe_equipment.sql`; de nieuwe migratie gebruikt `create or replace` met dezelfde definitie, dus geen botsing. Eigen trigger, `recipes_normalize()` onaangeroerd. Build in de loop-log geslaagd.

Criterium 5 (beheerder `[?]`) is niet gebouwd; volgt het parkeerpunt in `REQUIREMENTS.md`. Geen beslissing van de eigenaar nodig voor deze taak.

Alle acceptatiecriteria hebben echte tests (unit, databank, e2e). Bevindingen 1 en 2 uit ronde 2 zijn opgelost: unieke suffix voor de race-test, en opruimen in `afterAll`.

## Bevindingen

### 1. `tests/db/recipe-tags.test.ts:24-28,46-48` en `tests/e2e/recipe-tags.spec.ts:32-35,43-47` — laag — tester
**Probleem:** de opruimstap wist met `name_key like '%<suffix>%'`. De suffix bestaat uit de letters van `Math.random().toString(36)`, ingekort tot 6, en kan dus ook 1 of 2 letters lang zijn. Bij suffix `e` of `oe` worden starttags (`dessert`, `soep`, `hoofdgerecht` …) uit de gedeelde lokale catalogus gewist. Daarna faalt crit. 1 bij elke volgende run, tot `supabase db reset`. De kans is klein, maar dat is precies het soort sporadische fout dat de eindcontrole laat falen.
**Voorstel:** gebruik een suffix met vaste lengte (bijvoorbeeld 8 letters, aangevuld tot de volle lengte). Wis exact op de gebruikte namen (`name_key = public.fold_key(...)`), of minstens met `like '%' || suffix` en een minimumlengte.

### 2. `src/components/TagChoices.tsx:12,20` met `src/lib/tagFilter.ts:52` — laag — ontwikkelaar
**Probleem:** de knop wordt nu op `tagKey` ingedrukt, maar het filter zelf vergelijkt exact (`overlaps`). Bij een handgetypte URL `?soort=Soep` staat de knop "soep" ingedrukt, terwijl het overzicht "Niets gevonden." toont, ook als er soeprecepten zijn. Er is geen fout of crash, maar de interface spreekt zichzelf tegen.
**Voorstel:** zet de URL-waarden om naar de spelling uit de catalogus zodra die geladen is (via `replace`), zodat knop en filter dezelfde waarde gebruiken.

### 3. `README.md`, `.env.example` (untracked) — laag — ontwikkelaar
**Probleem:** deze bestanden staan nog in de werkkopie en horen niet bij T-010. Als alles gecommit wordt, gaan ze mee in de commit van de taak.
**Voorstel:** laat ze buiten de commit van T-010. De eigenaar beslist over een aparte commit.
