-- T-008 (R-015): optional source (max 200 characters) and note (max 1000 characters).

-- Nullable columns without default: an empty value is stored as null (see the trigger below).
alter table public.recipes
  add column source text,
  add column note text;

-- Not valid, same pattern as the other recipe checks: existing rows hold null anyway.
alter table public.recipes
  add constraint recipes_source_len check (source is null or char_length(source) between 1 and 200) not valid,
  add constraint recipes_note_len check (note is null or char_length(note) between 1 and 1000) not valid;

-- Same function as in recipe_content, plus source and note: trimmed, and empty becomes null.
-- Must keep the title, ingredients and steps handling intact.
create or replace function public.recipes_normalize()
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
  new.source := nullif(public.recipe_trim(new.source), '');
  new.note := nullif(public.recipe_trim(new.note), '');

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

-- The author may change these; the update policy itself stays as it is (author only).
grant update (source, note) on public.recipes to authenticated;
