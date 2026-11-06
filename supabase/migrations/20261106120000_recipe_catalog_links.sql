-- T-019 (R-018): an ingredient line may point to a catalogue item. The text (name, unit) always stays next to
-- the pointer, so nothing is lost and recipe_text_bytes (which counts only name and unit) is unchanged.

-- Same function as in recipe_content, plus the optional ingredient_id and unit_id (uuid in text form).
-- unit_id needs a unit text beside it.
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
      if v_key not in ('name', 'quantity', 'unit', 'ingredient_id', 'unit_id') then return false; end if;
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
  end loop;
  return true;
end;
$$;

-- No foreign key into a jsonb column, so a trigger checks that the ids exist (23503). A malformed id is
-- skipped here: the check constraint above rejects it (23514). Security definer: it reads the catalogues
-- whatever the caller may see.
create function public.recipes_check_catalog_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_id text;
begin
  if jsonb_typeof(new.ingredients) <> 'array' then return new; end if;
  for v_item in select value from jsonb_array_elements(new.ingredients) loop
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_id := case when jsonb_typeof(v_item -> 'ingredient_id') = 'string' then v_item ->> 'ingredient_id' end;
    if v_id ~ v_uuid and not exists (select 1 from public.ingredients i where i.id = v_id::uuid) then
      raise exception 'unknown ingredient_id' using errcode = '23503';
    end if;
    v_id := case when jsonb_typeof(v_item -> 'unit_id') = 'string' then v_item ->> 'unit_id' end;
    if v_id ~ v_uuid and not exists (select 1 from public.units u where u.id = v_id::uuid) then
      raise exception 'unknown unit_id' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

create trigger recipes_check_catalog_refs
  before insert or update of ingredients on public.recipes
  for each row execute function public.recipes_check_catalog_refs();

-- Adds ingredient_id / unit_id to every line whose key equals a name or synonym in the catalogue. Text,
-- quantity, order and all other columns stay. Rows that would change are updated one by one, each in its own
-- block: an old row that fails a (not valid) check or the size limit is left alone as free text.
-- Existing ids on a line are kept. Idempotent.
create function public.link_recipes_to_catalog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_line jsonb;
  v_new jsonb;
  v_out jsonb;
  v_ing uuid;
  v_unit uuid;
begin
  for r in select id, ingredients from public.recipes where jsonb_typeof(ingredients) = 'array' loop
    v_out := '[]'::jsonb;
    for v_line in select value from jsonb_array_elements(r.ingredients) loop
      v_new := v_line;
      if jsonb_typeof(v_line) = 'object' then
        if not (v_line ? 'ingredient_id') and jsonb_typeof(v_line -> 'name') = 'string' then
          select k.ingredient_id into v_ing from public.ingredient_keys k where k.key = public.item_key(v_line ->> 'name');
          if v_ing is not null then
            v_new := v_new || jsonb_build_object('ingredient_id', v_ing);
          end if;
        end if;
        if not (v_line ? 'unit_id') and jsonb_typeof(v_line -> 'unit') = 'string' then
          select k.unit_id into v_unit from public.unit_keys k where k.key = public.item_key(v_line ->> 'unit');
          if v_unit is not null then
            v_new := v_new || jsonb_build_object('unit_id', v_unit);
          end if;
        end if;
      end if;
      v_out := v_out || jsonb_build_array(v_new);
    end loop;
    if v_out is distinct from r.ingredients then
      begin
        update public.recipes set ingredients = v_out where id = r.id;
      exception when others then
        -- Any refusal (checks, size limit, photo rules) means: leave this old row as it is.
        null;
      end;
    end if;
  end loop;
end;
$$;

revoke execute on function public.link_recipes_to_catalog() from public, anon, authenticated;

-- One-off data migration, runs as the migration owner.
select public.link_recipes_to_catalog();

notify pgrst, 'reload schema';
