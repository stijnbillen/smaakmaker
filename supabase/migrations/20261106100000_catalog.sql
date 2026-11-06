-- T-019 (R-018): shared catalogues of ingredients and units.
-- Every name and synonym gets a key (item_key); a key table with a primary key makes the key unique over
-- both languages and all synonyms, which a unique constraint on the item table itself cannot do.

-- Like fold_key (lower case, no accents) plus runs of whitespace collapsed to one space.
-- fold_key itself stays as it is: tags and equipment have unique indexes on it.
create function public.item_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.fold_key(regexp_replace(p, '[[:space:]]+', ' ', 'g'));
$$;

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name_nl text,
  name_en text,
  synonyms text[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name_nl text,
  name_en text,
  synonyms text[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ingredient_keys (
  key text primary key,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade
);
create index ingredient_keys_item_idx on public.ingredient_keys (ingredient_id);

create table public.unit_keys (
  key text primary key,
  unit_id uuid not null references public.units (id) on delete cascade
);
create index unit_keys_item_idx on public.unit_keys (unit_id);

-- Names are null or 1..max characters, at least one name, at most 20 synonyms of 1..max characters.
-- Counted in characters (char_length) after trimming, which the normalise trigger has already done.
create function public.catalog_names_valid(p_nl text, p_en text, p_syn text[], p_max int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_s text;
begin
  if p_nl is null and p_en is null then return false; end if;
  if p_nl is not null and char_length(p_nl) not between 1 and p_max then return false; end if;
  if p_en is not null and char_length(p_en) not between 1 and p_max then return false; end if;
  if p_syn is null or coalesce(array_length(p_syn, 1), 0) > 20 then return false; end if;
  foreach v_s in array p_syn loop
    if v_s is null or char_length(v_s) not between 1 and p_max then return false; end if;
  end loop;
  return true;
end;
$$;

-- Trims, turns a blank name into null, drops synonyms whose key repeats inside the item, and validates.
-- TG_ARGV[0] is the maximum length (80 for ingredients, 20 for units).
create function public.catalog_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max int := tg_argv[0]::int;
  v_s text;
  v_t text;
  v_seen text[] := '{}';
  v_out text[] := '{}';
begin
  new.name_nl := nullif(public.recipe_trim(new.name_nl), '');
  new.name_en := nullif(public.recipe_trim(new.name_en), '');
  foreach v_s in array coalesce(new.synonyms, '{}') loop
    v_t := public.recipe_trim(v_s);
    if v_t is not null and public.item_key(v_t) = any(v_seen) then
      continue;
    end if;
    v_seen := v_seen || public.item_key(v_t);
    v_out := v_out || v_t;
  end loop;
  new.synonyms := v_out;
  if not public.catalog_names_valid(new.name_nl, new.name_en, new.synonyms, v_max) then
    raise exception 'invalid catalogue item' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ingredients_normalize
  before insert or update on public.ingredients
  for each row execute function public.catalog_normalize('80');
create trigger units_normalize
  before insert or update on public.units
  for each row execute function public.catalog_normalize('20');

-- Rebuilds the keys of the item. A key already held by another item breaks the primary key (23505) and
-- the whole statement rolls back. Security definer: clients may not write the key tables.
create function public.catalog_sync_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
begin
  select coalesce(array_agg(distinct k), '{}') into v_keys
  from unnest(array[new.name_nl, new.name_en] || new.synonyms) as t(n),
       lateral (select public.item_key(t.n) as k) s
  where t.n is not null and s.k <> '';
  if tg_table_name = 'ingredients' then
    delete from public.ingredient_keys where ingredient_id = new.id;
    insert into public.ingredient_keys (key, ingredient_id) select k, new.id from unnest(v_keys) k;
  else
    delete from public.unit_keys where unit_id = new.id;
    insert into public.unit_keys (key, unit_id) select k, new.id from unnest(v_keys) k;
  end if;
  return null;
end;
$$;

create trigger ingredients_sync_keys
  after insert or update on public.ingredients
  for each row execute function public.catalog_sync_keys();
create trigger units_sync_keys
  after insert or update on public.units
  for each row execute function public.catalog_sync_keys();

-- Rights: everyone signed in reads and adds a name; nobody changes or removes through the API.
-- Updating and deleting belong to R-022 (administrator management).
alter table public.ingredients enable row level security;
alter table public.units enable row level security;
alter table public.ingredient_keys enable row level security;
alter table public.unit_keys enable row level security;

revoke all on public.ingredients, public.units, public.ingredient_keys, public.unit_keys from public, anon, authenticated;
grant select on public.ingredients, public.units, public.ingredient_keys, public.unit_keys to authenticated;
grant insert (name_nl, name_en) on public.ingredients to authenticated;
grant insert (name_nl, name_en) on public.units to authenticated;

create policy ingredients_select on public.ingredients for select to authenticated using (true);
create policy ingredients_insert on public.ingredients for insert to authenticated with check (true);
create policy units_select on public.units for select to authenticated using (true);
create policy units_insert on public.units for insert to authenticated with check (true);
create policy ingredient_keys_select on public.ingredient_keys for select to authenticated using (true);
create policy unit_keys_select on public.unit_keys for select to authenticated using (true);

-- Adds an item with one name in the caller's language. A known key returns the existing item
-- (created = false), also when another user inserted the same key a moment earlier.
create function public.add_ingredient(p_name text, p_lang text)
returns table (id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lang is null or p_lang not in ('nl', 'en') then
    raise exception 'language must be nl or en' using errcode = '22023';
  end if;
  select k.ingredient_id into v_id from public.ingredient_keys k where k.key = public.item_key(p_name);
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;
  begin
    if p_lang = 'nl' then
      insert into public.ingredients (name_nl) values (p_name) returning ingredients.id into v_id;
    else
      insert into public.ingredients (name_en) values (p_name) returning ingredients.id into v_id;
    end if;
    return query select v_id, true;
  exception when unique_violation then
    select k.ingredient_id into v_id from public.ingredient_keys k where k.key = public.item_key(p_name);
    if v_id is null then raise; end if;
    return query select v_id, false;
  end;
end;
$$;

create function public.add_unit(p_name text, p_lang text)
returns table (id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lang is null or p_lang not in ('nl', 'en') then
    raise exception 'language must be nl or en' using errcode = '22023';
  end if;
  select k.unit_id into v_id from public.unit_keys k where k.key = public.item_key(p_name);
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;
  begin
    if p_lang = 'nl' then
      insert into public.units (name_nl) values (p_name) returning units.id into v_id;
    else
      insert into public.units (name_en) values (p_name) returning units.id into v_id;
    end if;
    return query select v_id, true;
  exception when unique_violation then
    select k.unit_id into v_id from public.unit_keys k where k.key = public.item_key(p_name);
    if v_id is null then raise; end if;
    return query select v_id, false;
  end;
end;
$$;

revoke execute on function public.add_ingredient(text, text), public.add_unit(text, text) from public, anon;
grant execute on function public.add_ingredient(text, text), public.add_unit(text, text) to authenticated;
grant execute on function public.item_key(text) to authenticated;

notify pgrst, 'reload schema';
