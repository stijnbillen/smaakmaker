-- T-023 (R-024): tags and equipment get an optional French name next to the Dutch one.
-- The Dutch name stays the canonical `name` (what recipes store); `name_fr` is only for display and lookup.
-- Items added by users have name_fr = null, so they show the same name in both languages.

alter table public.tags
  add column name_fr text check (name_fr is null or char_length(name_fr) between 1 and 30),
  add column name_fr_key text;
alter table public.equipment
  add column name_fr text check (name_fr is null or char_length(name_fr) between 1 and 30),
  add column name_fr_key text,
  -- Start list items are choices even when no recipe uses them (like the start tags).
  add column seeded boolean not null default false;

create unique index tags_kind_name_fr_key_idx on public.tags (kind, name_fr_key);
create unique index equipment_name_fr_key_idx on public.equipment (name_fr_key);

-- Keeps name_fr_key in step with name_fr and makes every key belong to one item over both languages:
-- a Dutch key may not be the French key of another item in the same group, and the other way round.
create function public.tags_check_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_fr := nullif(public.recipe_trim(new.name_fr), '');
  new.name_fr_key := case when new.name_fr is null then null else public.fold_key(new.name_fr) end;
  if exists (
    select 1 from public.tags t
    -- Another row with the same Dutch key is no cross conflict (a re-run of the start list insert).
    where t.id <> new.id and t.kind = new.kind and t.name_key <> new.name_key
      and (t.name_fr_key = new.name_key or (new.name_fr_key is not null and t.name_key = new.name_fr_key))
  ) then
    raise exception 'tag name is already used as a name in the other language' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger tags_check_keys
  before insert or update on public.tags
  for each row execute function public.tags_check_keys();

create function public.equipment_check_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_fr := nullif(public.recipe_trim(new.name_fr), '');
  new.name_fr_key := case when new.name_fr is null then null else public.fold_key(new.name_fr) end;
  if exists (
    select 1 from public.equipment e
    where e.id <> new.id and e.name_key <> new.name_key
      and (e.name_fr_key = new.name_key or (new.name_fr_key is not null and e.name_key = new.name_fr_key))
  ) then
    raise exception 'equipment name is already used as a name in the other language' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger equipment_check_keys
  before insert or update on public.equipment
  for each row execute function public.equipment_check_keys();

-- Resolvers: look up the Dutch or the French key first and return the canonical (Dutch) name.
-- Only an unknown name becomes a new row. Duplicates are removed on the canonical key, so "soep" and
-- "soupe" in one list give one entry (first position wins).
create or replace function public.resolve_tags(p_kind text, p text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_key text;
  v_canon text;
  v_keys text[] := '{}';
  v_out text[] := '{}';
begin
  foreach v_name in array coalesce(p, '{}') loop
    v_name := public.recipe_trim(v_name);
    if v_name is null or char_length(v_name) not between 1 and 30 then
      raise exception 'a tag must have 1 to 30 characters' using errcode = '23514';
    end if;
    v_key := public.fold_key(v_name);
    select t.name into v_canon from public.tags t
      where t.kind = p_kind and (t.name_key = v_key or t.name_fr_key = v_key)
      order by (t.name_key = v_key) desc limit 1;
    if not found then
      -- Concurrent savers of the same name end up on one row through the unique key.
      insert into public.tags (kind, name, name_key) values (p_kind, v_name, v_key)
        on conflict (kind, name_key) do nothing;
      select t.name into v_canon from public.tags t
        where t.kind = p_kind and (t.name_key = v_key or t.name_fr_key = v_key)
        order by (t.name_key = v_key) desc limit 1;
    end if;
    if public.fold_key(v_canon) = any(v_keys) then
      continue;
    end if;
    v_keys := v_keys || public.fold_key(v_canon);
    v_out := v_out || v_canon;
  end loop;
  if coalesce(array_length(v_out, 1), 0) > 20 then
    raise exception 'a recipe has at most 20 tags per group' using errcode = '23514';
  end if;
  return v_out;
end;
$$;
revoke execute on function public.resolve_tags(text, text[]) from public, anon, authenticated;

create or replace function public.recipe_equipment_resolve(p text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_key text;
  v_canon text;
  v_keys text[] := '{}';
  v_out text[] := '{}';
begin
  foreach v_name in array coalesce(p, '{}') loop
    v_name := public.recipe_trim(v_name);
    if v_name is null or char_length(v_name) not between 1 and 30 then
      raise exception 'equipment name must have 1 to 30 characters' using errcode = '23514';
    end if;
    v_key := public.fold_key(v_name);
    select e.name into v_canon from public.equipment e
      where e.name_key = v_key or e.name_fr_key = v_key
      order by (e.name_key = v_key) desc limit 1;
    if not found then
      insert into public.equipment (name, name_key) values (v_name, v_key) on conflict (name_key) do nothing;
      select e.name into v_canon from public.equipment e
        where e.name_key = v_key or e.name_fr_key = v_key
        order by (e.name_key = v_key) desc limit 1;
    end if;
    if public.fold_key(v_canon) = any(v_keys) then
      continue;
    end if;
    v_keys := v_keys || public.fold_key(v_canon);
    v_out := v_out || v_canon;
  end loop;
  if coalesce(array_length(v_out, 1), 0) > 20 then
    raise exception 'a recipe has at most 20 equipment items' using errcode = '23514';
  end if;
  return v_out;
end;
$$;
revoke execute on function public.recipe_equipment_resolve(text[]) from public, anon, authenticated;

-- Replaces every element whose key is in p_keys by p_canon and removes duplicates (first position wins).
create function public.merge_names_in_array(p text[], p_keys text[], p_canon text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(n order by m), '{}')
  from (
    select n, min(ord) as m
    from (
      select case when public.fold_key(e) = any(p_keys) then p_canon else e end as n, ord
      from unnest(p) with ordinality as u(e, ord)
    ) s
    group by n
  ) g;
$$;
revoke execute on function public.merge_names_in_array(text[], text[], text) from public, anon, authenticated;

-- The start lists and the merge of existing rows into them. A function so it can run again on a database
-- that holds older data (the migration test does this). It runs as its caller, the owner, so row-level
-- rules do not apply; nobody else may execute it. Order matters: rename the canonical row first (so the
-- resolvers return the new spelling), rewrite the recipes, drop the stale rows, and only then set the
-- French name (the key trigger would refuse it while a stale row still holds that key).
create function public.merge_seeded_names()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_keys text[];
  v_column text;
begin
  for r in
    select * from (values
      ('dish', 'dessert', 'dessert'), ('dish', 'soep', 'soupe'), ('dish', 'bijgerecht', 'accompagnement'),
      ('dish', 'tapas', 'tapas'), ('dish', 'hoofdgerecht', 'plat principal'), ('dish', 'ontbijt', 'petit-déjeuner'),
      ('dish', 'snack', 'en-cas'), ('dish', 'saus', 'sauce'),
      ('trait', 'winter', 'hiver'), ('trait', 'zomer', 'été'), ('trait', 'lente', 'printemps'),
      ('trait', 'herfst', 'automne'), ('trait', 'licht', 'léger'), ('trait', 'vegetarisch', 'végétarien'),
      ('trait', 'veganistisch', 'végan'), ('trait', 'glutenvrij', 'sans gluten'), ('trait', 'snel', 'rapide')
    ) as v(kind, nl, fr)
  loop
    v_keys := array[public.fold_key(r.nl), public.fold_key(r.fr)];
    v_column := case r.kind when 'dish' then 'dish_tags' else 'trait_tags' end;
    -- name_fr is cleared first: on a re-run the item already holds its French name, which a stale row would block.
    update public.tags set name = r.nl, name_fr = null where kind = r.kind and name_key = v_keys[1];
    execute format(
      'update public.recipes set %1$I = public.merge_names_in_array(%1$I, $1, $2)
       where exists (select 1 from unnest(%1$I) e where public.fold_key(e) = any($1) and e <> $2)', v_column)
      using v_keys, r.nl;
    delete from public.tags where kind = r.kind and name_key = any(v_keys) and name_key <> v_keys[1];
    -- "where not exists" instead of "on conflict": the key trigger runs before the conflict check and would
    -- compare the new row with the existing item that has the same Dutch and French name.
    insert into public.tags (kind, name, name_key) select r.kind, r.nl, v_keys[1]
      where not exists (select 1 from public.tags t where t.kind = r.kind and t.name_key = v_keys[1]);
    update public.tags set name_fr = r.fr where kind = r.kind and name_key = v_keys[1];
  end loop;

  for r in
    select * from (values
      ('oven', 'four'), ('kookplaat', 'plaque de cuisson'), ('microgolfoven', 'micro-ondes'),
      ('airfryer', 'friteuse à air chaud'), ('Thermomix', 'Thermomix'), ('staafmixer', 'mixeur plongeant'),
      ('blender', 'blender'), ('keukenrobot', 'robot de cuisine'), ('slowcooker', 'mijoteuse'),
      ('barbecue', 'barbecue')
    ) as v(nl, fr)
  loop
    v_keys := array[public.fold_key(r.nl), public.fold_key(r.fr)];
    update public.equipment set name = r.nl, name_fr = null where name_key = v_keys[1];
    update public.recipes set equipment = public.merge_names_in_array(equipment, v_keys, r.nl)
      where exists (select 1 from unnest(equipment) e where public.fold_key(e) = any(v_keys) and e <> r.nl);
    delete from public.equipment where name_key = any(v_keys) and name_key <> v_keys[1];
    insert into public.equipment (name, name_key) select r.nl, v_keys[1]
      where not exists (select 1 from public.equipment e where e.name_key = v_keys[1]);
    update public.equipment set name_fr = r.fr, seeded = true where name_key = v_keys[1];
  end loop;
end;
$$;
revoke execute on function public.merge_seeded_names() from public, anon, authenticated;

select public.merge_seeded_names();

-- Choices in the form and the filter: the start list plus every item a visible recipe uses.
create function public.equipment_choices()
returns table (name text, name_fr text)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.name, e.name_fr
  from public.equipment e
  where e.seeded or exists (select 1 from public.recipes r where r.equipment @> array[e.name])
  order by e.name_key;
$$;
revoke execute on function public.equipment_choices() from public, anon;
grant execute on function public.equipment_choices() to authenticated;

notify pgrst, 'reload schema';
