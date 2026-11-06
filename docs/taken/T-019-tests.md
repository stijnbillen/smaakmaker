# T-019 — tests

Files: `tests/unit/catalog.test.ts`, `tests/unit/recipe-catalog.test.ts`, `tests/db/catalog.test.ts`, `tests/db/catalog-links.test.ts`, `tests/e2e/recipe-catalog.spec.ts`.

## Covered
- Crit. 1: name and synonym lengths (80/81, 20/21), blank names, both-null, 20/21 synonyms, empty and too-long synonym, code points not bytes (é, emoji), for ingredients and units; `item_key` in db and `itemKey` in unit.
- Crit. 2: duplicate keys (case, synonym, English name vs Dutch key), admin synonym clash, same key in nl/en of one item, ingredient + unit with same key, both races (RPC and direct insert).
- Crit. 3: counts ≥150/≥25, broccoli, aardappel, tomaat, required units, el/tl synonyms, seed in a migration not seed.sql, R-019 guard keys (zout, paprika present; tomaten, paprica, tomaaat absent).
- Crit. 4: anon reads and RPC (42501), signed-in reads others' items.
- Crit. 5: add_ingredient/add_unit nl/en/other language (22023)/invalid names (23514)/idempotent `created=false`; update/delete/insert-with-extra-columns refused; key tables closed.
- Crit. 6: `link_recipes_to_catalog` outcome, text/other columns/bytes/count unchanged, idempotent, old row skipped, not executable by clients; ids accepted/refused (23503, 23514), not counted in size; unit tests for keeping/dropping links and variants; e2e edit keeps/drops link and detail text unchanged.

## Not covered / notes
- Detail page showing "the same text before and after the linking migration" is only checked in the e2e after an edit, not across the migration itself (migration runs once at reset).
- The "title-only old row" case is tested as an old row failing the `recipes_prep_required` check (built inside a rolled-back transaction that drops/re-adds that constraint as `not valid`); a title-only insert is impossible with current checks.
- Unit/e2e assume snake_case `ingredient_id`/`unit_id` in stored lines, camel-case internals are free (tests go through `draftFromRecord` → `toRow`).
- Unit test `catalog.test.ts` fails to compile until `src/lib/catalog.ts` (`itemKey`) exists: expected test seam.
- Ran only `tsc --noEmit`; DB/e2e tests need the migrations from the developer.
