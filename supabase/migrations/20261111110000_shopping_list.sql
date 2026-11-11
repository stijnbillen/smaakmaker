-- T-034 (R-032): shopping list data. The list itself is computed in the client from the week menu; only
-- the per-user state is stored: marks ("bought" / "have") per line key, and own items. Both are private
-- to the user, also for admins.

create table public.shopping_marks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  line_key text not null check (char_length(line_key) between 1 and 400),
  -- One row per line, so "bought" and "have" can never be set at the same time.
  state text not null check (state in ('bought', 'have')),
  updated_at timestamptz not null default now(),
  primary key (user_id, line_key)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (text = btrim(text) and char_length(text) between 1 and 80),
  bought boolean not null default false,
  created_at timestamptz not null default now()
);

create index shopping_items_user_id_idx on public.shopping_items (user_id);

alter table public.shopping_marks enable row level security;
alter table public.shopping_items enable row level security;

revoke all on public.shopping_marks from anon, authenticated;
revoke all on public.shopping_items from anon, authenticated;
-- The user comes from the default auth.uid(); the key and the text cannot change afterwards.
grant select, delete on public.shopping_marks to authenticated;
grant insert (line_key, state) on public.shopping_marks to authenticated;
grant update (state, updated_at) on public.shopping_marks to authenticated;
grant select, delete on public.shopping_items to authenticated;
grant insert (text) on public.shopping_items to authenticated;
grant update (bought) on public.shopping_items to authenticated;

-- No exception for is_admin(): the list is personal, for admins too.
create policy shopping_marks_select on public.shopping_marks
  for select to authenticated using (user_id = auth.uid());
create policy shopping_marks_insert on public.shopping_marks
  for insert to authenticated with check (user_id = auth.uid());
create policy shopping_marks_update on public.shopping_marks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shopping_marks_delete on public.shopping_marks
  for delete to authenticated using (user_id = auth.uid());

create policy shopping_items_select on public.shopping_items
  for select to authenticated using (user_id = auth.uid());
create policy shopping_items_insert on public.shopping_items
  for insert to authenticated with check (user_id = auth.uid());
create policy shopping_items_update on public.shopping_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shopping_items_delete on public.shopping_items
  for delete to authenticated using (user_id = auth.uid());

-- Limits per user, under an advisory lock so two parallel inserts cannot both pass the count.
-- Security definer only so the count is not limited by the caller's rights; it counts rows of new.user_id.
create function public.shopping_items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('shopping_items:' || new.user_id::text));
  if (select count(*) from public.shopping_items where user_id = new.user_id) >= 100 then
    raise exception 'shopping list is full (at most 100 own items)' using errcode = 'P0100';
  end if;
  return new;
end;
$$;

revoke execute on function public.shopping_items_before_insert() from public, anon, authenticated;

create trigger shopping_items_before_insert
  before insert on public.shopping_items
  for each row execute function public.shopping_items_before_insert();

-- 50 dishes x 60 lines = 3000: a bound against abuse through the API, not a limit users meet.
create function public.shopping_marks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('shopping_marks:' || new.user_id::text));
  if (select count(*) from public.shopping_marks where user_id = new.user_id) >= 3000 then
    raise exception 'too many shopping marks (at most 3000)' using errcode = 'P0101';
  end if;
  return new;
end;
$$;

revoke execute on function public.shopping_marks_before_insert() from public, anon, authenticated;

create trigger shopping_marks_before_insert
  before insert on public.shopping_marks
  for each row execute function public.shopping_marks_before_insert();

-- Removes the caller's marks whose line no longer exists. Security invoker: row-level security keeps it to own rows.
create function public.prune_shopping_marks(p_keys text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_keys is null or coalesce(array_length(p_keys, 1), 0) > 3000 then
    raise exception 'p_keys must be a list of at most 3000 keys' using errcode = '22023';
  end if;
  delete from public.shopping_marks where user_id = auth.uid() and line_key <> all (p_keys);
end;
$$;

revoke execute on function public.prune_shopping_marks(text[]) from public, anon;
grant execute on function public.prune_shopping_marks(text[]) to authenticated;

-- "Leegmaken" wipes the menu and everything of the shopping list in one transaction.
create or replace function public.clear_week_menu()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.week_menu_items where user_id = auth.uid();
  delete from public.shopping_marks where user_id = auth.uid();
  delete from public.shopping_items where user_id = auth.uid();
$$;

revoke execute on function public.clear_week_menu() from public, anon;
grant execute on function public.clear_week_menu() to authenticated;

notify pgrst, 'reload schema';
