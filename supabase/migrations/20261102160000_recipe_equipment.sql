-- T-009 (R-008): equipment (cooking gear) per recipe, picked from a shared list.
-- Stored as text[] on the recipe row plus a catalogue for the canonical spelling.

create extension if not exists unaccent with schema extensions;

-- Case- and accent-insensitive key. unaccent() is not immutable, so the dictionary is named explicitly
-- in an own immutable wrapper; that makes it usable in a unique constraint. Reusable for tags and search.
create function public.fold_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, public.recipe_trim(p)));
$$;

-- Catalogue: the first spelling of a name stays canonical. Clients can read it, never write it;
-- rows only appear through recipe_equipment_resolve() when a recipe is saved.
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  name_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.equipment enable row level security;
create policy equipment_select on public.equipment for select to authenticated using (true);
revoke all on public.equipment from public, anon, authenticated;
grant select on public.equipment to authenticated;

alter table public.recipes add column equipment text[] not null default '{}';
-- For the overview filter (&& / overlaps).
create index recipes_equipment_idx on public.recipes using gin (equipment);

-- Trims, validates (1-30 characters, at most 20 items), reuses catalogue spelling and removes duplicates
-- (first occurrence wins). Security definer because it writes the catalogue, which clients cannot.
create function public.recipe_equipment_resolve(p text[])
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
    if v_key = any(v_keys) then
      continue;
    end if;
    -- Concurrent savers of the same name end up on one row through the unique key.
    insert into public.equipment (name, name_key) values (v_name, v_key) on conflict (name_key) do nothing;
    select e.name into v_canon from public.equipment e where e.name_key = v_key;
    v_keys := v_keys || v_key;
    v_out := v_out || v_canon;
  end loop;
  if coalesce(array_length(v_out, 1), 0) > 20 then
    raise exception 'a recipe has at most 20 equipment items' using errcode = '23514';
  end if;
  return v_out;
end;
$$;

-- Only the trigger below may call it, and that runs as the owner (security definer), not as the client.
revoke execute on function public.recipe_equipment_resolve(text[]) from public, anon, authenticated;

-- Same function as in recipe_source_note, plus equipment. Must keep title, source, note, ingredients
-- and steps handling intact. Security definer so it may call the resolve function above.
create or replace function public.recipes_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_out jsonb;
  v_unit text;
begin
  new.title := public.recipe_trim(new.title);
  new.source := nullif(public.recipe_trim(new.source), '');
  new.note := nullif(public.recipe_trim(new.note), '');
  new.equipment := public.recipe_equipment_resolve(coalesce(new.equipment, '{}'));

  if jsonb_typeof(new.ingredients) = 'array' then
    v_out := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(new.ingredients) loop
      if jsonb_typeof(v_item) = 'object' then
        if jsonb_typeof(v_item -> 'name') = 'string' then
          v_item := jsonb_set(v_item, '{name}', to_jsonb(public.recipe_trim(v_item ->> 'name')));
        end if;
        if jsonb_typeof(v_item -> 'unit') = 'string' then
          v_unit := public.recipe_trim(v_item ->> 'unit');
          if v_unit = '' then
            v_item := v_item - 'unit';
          else
            v_item := jsonb_set(v_item, '{unit}', to_jsonb(v_unit));
          end if;
        end if;
      end if;
      v_out := v_out || jsonb_build_array(v_item);
    end loop;
    new.ingredients := v_out;
  end if;

  if jsonb_typeof(new.steps) = 'array' then
    v_out := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(new.steps) loop
      if jsonb_typeof(v_item) = 'string' then
        v_item := to_jsonb(public.recipe_trim(v_item #>> '{}'));
      end if;
      v_out := v_out || jsonb_build_array(v_item);
    end loop;
    new.steps := v_out;
  end if;

  return new;
end;
$$;

-- The author may change it; the update policy itself stays as it is (author only).
grant update (equipment) on public.recipes to authenticated;

-- Names that are in at least one recipe the caller can see: the choices in the form and the filter.
create function public.equipment_in_use()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select e.name
  from public.equipment e
  where exists (select 1 from public.recipes r where r.equipment @> array[e.name])
  order by e.name_key;
$$;
revoke execute on function public.equipment_in_use() from public, anon;
grant execute on function public.equipment_in_use() to authenticated;
