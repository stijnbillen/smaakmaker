-- T-021 (R-020): an ingredient line may carry a size (small, medium, large), stored as that code and
-- translated when shown. The code counts towards the recipe size, like the other text of a line.

-- Same function as in recipe_catalog_links, plus the optional size.
create or replace function public.recipe_ingredients_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
  v_quantity numeric;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) not between 1 and 60 then return false; end if;
  for v_item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    for v_key in select jsonb_object_keys(v_item) loop
      if v_key not in ('name', 'quantity', 'unit', 'ingredient_id', 'unit_id', 'size') then return false; end if;
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
    if v_item ? 'ingredient_id' then
      if jsonb_typeof(v_item -> 'ingredient_id') <> 'string' or (v_item ->> 'ingredient_id') !~ v_uuid then return false; end if;
    end if;
    if v_item ? 'unit_id' then
      if jsonb_typeof(v_item -> 'unit_id') <> 'string' or (v_item ->> 'unit_id') !~ v_uuid then return false; end if;
      if not (v_item ? 'unit') then return false; end if;
    end if;
    if v_item ? 'size' then
      if jsonb_typeof(v_item -> 'size') <> 'string' or (v_item ->> 'size') not in ('small', 'medium', 'large') then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

-- Same function as in recipe_size_limit, plus the bytes of the size code.
create or replace function public.recipe_text_bytes(r public.recipes)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(octet_length(r.title), 0)
    + coalesce(octet_length(r.source), 0)
    + coalesce(octet_length(r.note), 0)
    + case when jsonb_typeof(r.ingredients) = 'array' then coalesce((
        select sum(
          coalesce(octet_length(e ->> 'name'), 0)
          + coalesce(octet_length(e ->> 'unit'), 0)
          + coalesce(octet_length(e ->> 'size'), 0))
        from jsonb_array_elements(r.ingredients) e
        where jsonb_typeof(e) = 'object'
      ), 0) else 0 end
    + case when jsonb_typeof(r.steps) = 'array' then coalesce((
        select sum(octet_length(s #>> '{}'))
        from jsonb_array_elements(r.steps) s
        where jsonb_typeof(s) = 'string'
      ), 0) else 0 end
    + coalesce((select sum(octet_length(n)) from unnest(r.dish_tags) n), 0)
    + coalesce((select sum(octet_length(n)) from unnest(r.trait_tags) n), 0)
    + coalesce((select sum(octet_length(n)) from unnest(r.equipment) n), 0);
$$;

-- Same function as in recipe_equipment, plus: a null or empty size is left out, like an empty unit.
-- A size of another type stays, so the check above refuses it.
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
        if v_item ? 'size' and (
          jsonb_typeof(v_item -> 'size') = 'null'
          or (jsonb_typeof(v_item -> 'size') = 'string' and public.recipe_trim(v_item ->> 'size') = '')
        ) then
          v_item := v_item - 'size';
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

notify pgrst, 'reload schema';
