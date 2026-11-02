-- T-010 (R-010): dish-type tags per recipe, picked from a shared catalogue per group ("kind").
-- Stored as text[] on the recipe row plus a catalogue for the canonical spelling.
-- recipes_normalize() stays untouched: tags get their own trigger.

create extension if not exists unaccent with schema extensions;

-- Same definition as in recipe_equipment (create or replace keeps both migrations compatible).
create or replace function public.fold_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, public.recipe_trim(p)));
$$;
grant execute on function public.fold_key(text) to authenticated;

-- Catalogue: the first spelling of a name stays canonical. Clients can read it, never write it;
-- rows only appear through resolve_tags() when a recipe is saved. Nobody renames or removes tags.
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dish')),
  name text not null check (char_length(name) between 1 and 30),
  name_key text not null,
  created_at timestamptz not null default now(),
  unique (kind, name_key)
);

alter table public.tags enable row level security;
create policy tags_select on public.tags for select to authenticated using (true);
revoke all on public.tags from public, anon, authenticated;
grant select on public.tags to authenticated;

-- Start list; safe to run again.
insert into public.tags (kind, name, name_key)
select 'dish', n, public.fold_key(n)
from unnest(array['dessert', 'soep', 'bijgerecht', 'tapas', 'hoofdgerecht', 'ontbijt', 'snack', 'saus']) n
on conflict (kind, name_key) do nothing;

alter table public.recipes add column dish_tags text[] not null default '{}';
-- For the overview filter (&& / overlaps).
create index recipes_dish_tags_idx on public.recipes using gin (dish_tags);

-- Trims, validates (1-30 characters, at most 20 per recipe), reuses catalogue spelling and removes
-- duplicates (first occurrence wins). Security definer because it writes the catalogue, which clients cannot.
create function public.resolve_tags(p_kind text, p text[])
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
    if v_key = any(v_keys) then
      continue;
    end if;
    -- Concurrent savers of the same name end up on one row through the unique key.
    insert into public.tags (kind, name, name_key) values (p_kind, v_name, v_key)
      on conflict (kind, name_key) do nothing;
    select t.name into v_canon from public.tags t where t.kind = p_kind and t.name_key = v_key;
    v_keys := v_keys || v_key;
    v_out := v_out || v_canon;
  end loop;
  if coalesce(array_length(v_out, 1), 0) > 20 then
    raise exception 'a recipe has at most 20 tags per group' using errcode = '23514';
  end if;
  return v_out;
end;
$$;
revoke execute on function public.resolve_tags(text, text[]) from public, anon, authenticated;

create function public.recipes_resolve_dish_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.dish_tags := public.resolve_tags('dish', coalesce(new.dish_tags, '{}'));
  return new;
end;
$$;
revoke execute on function public.recipes_resolve_dish_tags() from public, anon, authenticated;

create trigger recipes_resolve_dish_tags
  before insert or update of dish_tags on public.recipes
  for each row execute function public.recipes_resolve_dish_tags();

-- The author may change it; the update policy itself stays as it is (author only).
grant update (dish_tags) on public.recipes to authenticated;
