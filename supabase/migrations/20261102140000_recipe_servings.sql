-- T-007 (R-013): number of servings, a whole number from 1 to 99.

-- Nullable column with "not valid" checks, same pattern as the times: existing sample rows stay as
-- they are, every new or changed row must carry valid servings.
-- integer rejects text and half servings by itself (22P02); the checks cover required and range.
alter table public.recipes
  add column servings integer;

alter table public.recipes
  add constraint recipes_servings_required check (servings is not null) not valid,
  add constraint recipes_servings_range check (servings between 1 and 99) not valid;

-- The author may change the servings; the update policy itself stays as it is (author only).
grant update (servings) on public.recipes to authenticated;
