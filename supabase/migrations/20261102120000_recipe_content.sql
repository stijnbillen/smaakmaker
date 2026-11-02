-- T-005 (R-003): recipe content (ingredients, steps), validation, normalising and edit rights.

alter table public.recipes
  add column ingredients jsonb not null default '[]',
  add column steps jsonb not null default '[]';

-- Trims leading/trailing whitespace of any kind (btrim alone only removes plain spaces).
create function public.recipe_trim(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(p, '^[[:space:]]+|[[:space:]]+$', '', 'g');
$$;

-- An ingredient is { name, quantity?, unit? }. Lengths are counted in characters, like the client counts code points.
create function public.recipe_ingredients_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
  v_quantity numeric;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) not between 1 and 60 then return false; end if;
  for v_item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    for v_key in select jsonb_object_keys(v_item) loop
      if v_key not in ('name', 'quantity', 'unit') then return false; end if;
    end loop;
    if jsonb_typeof(v_item -> 'name') is distinct from 'string' then return false; end if;
    if char_length(v_item ->> 'name') not between 1 and 80 then return false; end if;
    if v_item ? 'quantity' then
      if jsonb_typeof(v_item -> 'quantity') <> 'number' then return false; end if;
      v_quantity := (v_item ->> 'quantity')::numeric;
      -- Upper bound is our own choice, against nonsense values.
      if v_quantity <= 0 or v_quantity >= 1000000 or scale(trim_scale(v_quantity)) > 2 then return false; end if;
    end if;
    if v_item ? 'unit' then
      if jsonb_typeof(v_item -> 'unit') <> 'string' then return false; end if;
      if char_length(v_item ->> 'unit') not between 1 and 20 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

create function public.recipe_steps_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) not between 1 and 40 then return false; end if;
  for v_item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_item) <> 'string' then return false; end if;
    if char_length(v_item #>> '{}') not between 1 and 1000 then return false; end if;
  end loop;
  return true;
end;
$$;

-- Not valid: existing sample rows (title only) must not break the migration; new and changed rows are checked.
alter table public.recipes
  add constraint recipes_title_len check (char_length(title) between 1 and 100) not valid,
  add constraint recipes_ingredients_valid check (public.recipe_ingredients_valid(ingredients)) not valid,
  add constraint recipes_steps_valid check (public.recipe_steps_valid(steps)) not valid;

-- Normalises before the checks run, so "after trimming" also holds for a direct API call.
-- Wrong shapes are left alone here; the checks reject them.
create function public.recipes_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_out jsonb;
  v_unit text;
begin
  new.title := public.recipe_trim(new.title);

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

create trigger recipes_normalize
  before insert or update on public.recipes
  for each row execute function public.recipes_normalize();

-- Only the author edits, and only these columns: author_id, id and created_at cannot be forged (42501).
-- An administrator gets no update policy; administrators delete, they do not edit.
-- Supabase's default privileges give authenticated update on every column; take that away first,
-- otherwise the column grant below restricts nothing.
revoke update on public.recipes from authenticated;
grant update (title, ingredients, steps) on public.recipes to authenticated;

create policy "recipes update by author"
  on public.recipes for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
