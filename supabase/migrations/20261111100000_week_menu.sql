-- T-033 (R-030): personal week menu. One row per (user, recipe), private to the user, also for admins.
-- Like favourites it lives in its own table and never touches the recipe row, so the update rules
-- and the 2 MB limit of recipes stay as they are.

create table public.week_menu_items (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- Filled by the insert trigger when the client sends nothing. NOT NULL and the check are
  -- verified after the BEFORE trigger, so a missing value is completed first.
  servings integer not null check (servings between 1 and 99),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- Deleting a recipe cascades on recipe_id; the primary key only covers lookups by user first.
create index week_menu_items_recipe_id_idx on public.week_menu_items (recipe_id);

alter table public.week_menu_items enable row level security;

revoke all on public.week_menu_items from anon, authenticated;
-- The user comes from the default auth.uid(); only the portions can change afterwards.
grant select, delete on public.week_menu_items to authenticated;
grant insert (recipe_id, servings) on public.week_menu_items to authenticated;
grant update (servings) on public.week_menu_items to authenticated;

-- No exception for is_admin(): the menu is personal, for admins too.
create policy week_menu_items_select on public.week_menu_items
  for select to authenticated using (user_id = auth.uid());
create policy week_menu_items_insert on public.week_menu_items
  for insert to authenticated with check (user_id = auth.uid());
create policy week_menu_items_update on public.week_menu_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy week_menu_items_delete on public.week_menu_items
  for delete to authenticated using (user_id = auth.uid());

-- Limit of 50 dishes and default portions. Security definer only to read the recipe's servings
-- (the caller may not see every column path) and to count the rows of new.user_id.
create function public.week_menu_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_servings integer;
begin
  -- One lock per user: two parallel inserts cannot both pass the count below.
  perform pg_advisory_xact_lock(hashtext('week_menu:' || new.user_id::text));

  select count(*) into v_count from public.week_menu_items where user_id = new.user_id;
  if v_count >= 50 then
    raise exception 'week menu is full (at most 50 dishes)' using errcode = 'P0050';
  end if;

  if new.servings is null then
    select r.servings into v_servings from public.recipes r where r.id = new.recipe_id;
    new.servings := coalesce(v_servings, 1);
  end if;
  return new;
end;
$$;

revoke execute on function public.week_menu_before_insert() from public, anon, authenticated;

create trigger week_menu_items_before_insert
  before insert on public.week_menu_items
  for each row execute function public.week_menu_before_insert();

-- Clears the caller's menu in one transaction. The task for R-032 adds the shopping list tables here,
-- so "clear" wipes everything at once. Security invoker: row-level security limits it to own rows.
create function public.clear_week_menu()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.week_menu_items where user_id = auth.uid();
$$;

revoke execute on function public.clear_week_menu() from public, anon;
grant execute on function public.clear_week_menu() to authenticated;

-- Computed field: PostgREST exposes it as a column of recipes (like is_favorite).
create function public.in_week_menu(r public.recipes)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.week_menu_items w where w.user_id = auth.uid() and w.recipe_id = r.id
  );
$$;

revoke execute on function public.in_week_menu(public.recipes) from public, anon;
grant execute on function public.in_week_menu(public.recipes) to authenticated;

notify pgrst, 'reload schema';
