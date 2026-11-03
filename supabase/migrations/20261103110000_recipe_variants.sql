-- T-014 (R-006): variants. A variant is a full recipe of its own with a fixed link to its source.
-- variant_of: the direct source (null when there is none, or when it was deleted).
-- family_id:  the family, fixed at creation, so a family does not fall apart when a middle recipe is deleted.

alter table public.recipes
  add column variant_of uuid null references public.recipes (id) on delete set null;

-- Existing rows are their own family. Nothing is deleted.
alter table public.recipes add column family_id uuid;
update public.recipes set family_id = id where family_id is null;
alter table public.recipes alter column family_id set not null;

create index recipes_variant_of_idx on public.recipes (variant_of);
create index recipes_family_id_idx on public.recipes (family_id);

-- A recipe is never its own source.
alter table public.recipes
  add constraint recipes_not_own_source check (variant_of is null or variant_of <> id);

-- The family comes from the source, never from the client. Without a source the recipe starts its own family.
-- A source that does not exist leaves the own id here; the foreign key then refuses the row (23503).
create function public.recipes_set_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.family_id := coalesce((select r.family_id from public.recipes r where r.id = new.variant_of), new.id);
  return new;
end;
$$;
revoke execute on function public.recipes_set_family() from public, anon, authenticated;

create trigger recipes_set_family
  before insert on public.recipes
  for each row execute function public.recipes_set_family();

-- Also for the service role (which has no column privileges): the source is fixed once the recipe exists,
-- so no cycle can arise. Moving variant_of to null stays allowed: the `on delete set null` of the foreign key
-- is itself an update.
create function public.recipes_guard_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.family_id is distinct from old.family_id then
    raise exception 'family_id cannot be changed' using errcode = '23514';
  end if;
  if new.variant_of is distinct from old.variant_of and new.variant_of is not null then
    raise exception 'variant_of cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recipes_guard_variant
  before update on public.recipes
  for each row execute function public.recipes_guard_variant();

-- No column privilege (update) on variant_of or family_id: the existing grants list their columns.
-- The insert privilege covers all columns, and the policy "recipes insert as author" stays as it is.

notify pgrst, 'reload schema';
