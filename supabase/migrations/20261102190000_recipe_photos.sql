-- T-012 (R-005): photos. A private bucket, storage policies, and recipes.photos (jsonb) with its rules.
-- Files live at <recipe_id>/<uuid>.jpg. The size sum of 2 MB per recipe is a later task (T-013).

-- Bucket: private, 512000 bytes, JPEG only. In a migration so the cloud project gets it too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 512000, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 512000,
      allowed_mime_types = array['image/jpeg'];

-- Policies on storage.objects. No update policy: overwriting and upsert stay closed for everyone.
create policy "recipe photos readable by signed-in users"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recipe-photos');

-- The photo is uploaded before the recipe row exists, so the folder may belong to a recipe that does not
-- exist yet; once it exists only its author may add files. The case keeps the uuid cast from running on
-- a name that is not shaped like one.
create policy "recipe photos insert in own recipe folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and case
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
        then not exists (
          select 1 from public.recipes r
          where r.id = (storage.foldername(name))[1]::uuid
            and r.author_id <> auth.uid()
        )
      else false
    end
  );

create policy "recipe photos delete by owner or admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recipe-photos' and (owner_id = auth.uid()::text or public.is_admin()));

-- The list: at most 3 elements, each exactly { path, main }, path <recipe id>/<uuid>.jpg and unique,
-- exactly one main when the list is not empty.
create function public.recipe_photos_valid(p jsonb, p_id uuid)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_path text;
  v_paths text[] := '{}';
  v_mains int := 0;
begin
  if jsonb_typeof(p) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p) > 3 then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(v_item)) <> 2 or not (v_item ? 'path') or not (v_item ? 'main') then
      return false;
    end if;
    if jsonb_typeof(v_item -> 'path') is distinct from 'string' or jsonb_typeof(v_item -> 'main') is distinct from 'boolean' then
      return false;
    end if;
    v_path := v_item ->> 'path';
    if v_path !~ ('^' || p_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
      return false;
    end if;
    if v_path = any (v_paths) then
      return false;
    end if;
    v_paths := v_paths || v_path;
    if (v_item ->> 'main')::boolean then
      v_mains := v_mains + 1;
    end if;
  end loop;
  return jsonb_array_length(p) = 0 or v_mains = 1;
end;
$$;

alter table public.recipes add column photos jsonb not null default '[]';
alter table public.recipes
  add constraint recipes_photos_valid check (public.recipe_photos_valid(photos, id));

-- Runs before the check. Makes the first photo the main one when none is, and demands that every path
-- is a file of this author in the bucket, so nobody can point at someone else's or a missing file.
-- A list of the wrong shape is left alone: the check refuses it (23514).
create function public.recipes_check_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_old jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and jsonb_typeof(old.photos) = 'array' then
    v_old := old.photos;
  end if;

  if jsonb_typeof(new.photos) is distinct from 'array' or jsonb_array_length(new.photos) = 0 then
    return new;
  end if;

  if jsonb_typeof(new.photos -> 0) = 'object'
     and not exists (
       select 1 from jsonb_array_elements(new.photos) e
       where jsonb_typeof(e -> 'main') is distinct from 'boolean' or (e ->> 'main')::boolean
     ) then
    -- Every element has main = false (or the shape is wrong, which the check handles).
    new.photos := jsonb_set(new.photos, '{0,main}', 'true');
  end if;

  for v_item in select value from jsonb_array_elements(new.photos) loop
    -- Paths already stored are not re-checked: a file lost outside the app must not block other edits.
    if jsonb_typeof(v_item) = 'object' and jsonb_typeof(v_item -> 'path') = 'string'
       and not exists (select 1 from jsonb_array_elements(v_old) o where o ->> 'path' = v_item ->> 'path') then
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'recipe-photos'
          and o.name = v_item ->> 'path'
          and o.owner_id = new.author_id::text
      ) then
        raise exception 'photo file not found for this author' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.recipes_check_photos() from public, anon, authenticated;

create trigger recipes_check_photos
  before insert or update of photos on public.recipes
  for each row execute function public.recipes_check_photos();

-- The author may change it; the update policy itself stays as it is (author only).
grant update (photos) on public.recipes to authenticated;
