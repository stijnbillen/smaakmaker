-- T-013 (R-004): a recipe is at most 2 MB = 2.097.152 bytes: the UTF-8 bytes of its text fields plus the
-- bytes of its photos. Enforced by an after-trigger, so it measures the final row (after all normalising).

create function public.recipe_size_limit()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 2097152::bigint; $$;

-- UTF-8 bytes of every text value: title, ingredient names and units, steps, source, note and all tag and
-- equipment names. Numbers and the JSON structure do not count (their text form differs per client).
create function public.recipe_text_bytes(r public.recipes)
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
        select sum(coalesce(octet_length(e ->> 'name'), 0) + coalesce(octet_length(e ->> 'unit'), 0))
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

-- Sum of the stored file sizes of the listed photos. A file without a known size, or a path without a
-- file, counts as the bucket maximum (512000): strict, so it can never be used to slip under the limit.
-- security definer because users cannot read storage.objects; only a number is returned, no names.
-- Not callable by clients at all (/rpc would reveal whether a file exists); the trigger runs as owner.
create function public.recipe_photo_bytes(p jsonb)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'array' then coalesce((
    select sum(coalesce((o.metadata ->> 'size')::bigint, 512000))
    from jsonb_array_elements(p) e
    left join storage.objects o on o.bucket_id = 'recipe-photos' and o.name = e ->> 'path'
    where jsonb_typeof(e) = 'object'
  ), 0) else 0 end;
$$;
revoke execute on function public.recipe_photo_bytes(jsonb) from public, anon, authenticated;

-- null when it fits; 'text' when the text alone is over the limit; otherwise 'photos'.
create function public.recipe_size_problem(p_text bigint, p_photos bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text + p_photos <= public.recipe_size_limit() then null
    when p_text > public.recipe_size_limit() then 'text'
    else 'photos'
  end;
$$;

create function public.recipes_check_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
begin
  v_problem := public.recipe_size_problem(public.recipe_text_bytes(new), public.recipe_photo_bytes(new.photos));
  if v_problem is not null then
    -- The exception rolls the whole statement back, so the row stays as it was.
    raise exception 'recipe_too_large' using errcode = '23514', detail = v_problem;
  end if;
  return null;
end;
$$;
revoke execute on function public.recipes_check_size() from public, anon, authenticated;

-- No column list: every insert and every update is measured.
create trigger recipes_check_size
  after insert or update on public.recipes
  for each row execute function public.recipes_check_size();

notify pgrst, 'reload schema';
