-- T-006 (R-007): preparation time and total time, in whole minutes.

-- Nullable columns with "not valid" checks, same pattern as the recipe content: existing sample rows
-- stay as they are, every new or changed row must carry valid times.
-- integer rejects text and half minutes by itself (22P02); the checks cover required, range and order.
alter table public.recipes
  add column prep_minutes integer,
  add column total_minutes integer;

alter table public.recipes
  add constraint recipes_prep_required check (prep_minutes is not null) not valid,
  add constraint recipes_total_required check (total_minutes is not null) not valid,
  add constraint recipes_prep_range check (prep_minutes between 0 and 4320) not valid,
  add constraint recipes_total_range check (total_minutes between 0 and 4320) not valid,
  add constraint recipes_total_ge_prep check (total_minutes >= prep_minutes) not valid;

-- The author may change the times; the update policy itself stays as it is (author only).
grant update (prep_minutes, total_minutes) on public.recipes to authenticated;

-- For the maximum-time filters in the overview.
create index recipes_prep_minutes_idx on public.recipes (prep_minutes);
create index recipes_total_minutes_idx on public.recipes (total_minutes);
