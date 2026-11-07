-- T-025 (R-022): administration of the ingredient and unit catalogues.
-- Nobody gets update or delete rights on the catalogue tables. An administrator works only through the
-- admin_* functions below, which are security definer and check is_admin() themselves, so a normal user
-- cannot change anything with or without the interface.

-- Number of different recipes with at least one line that points to the item (a recipe with two lines
-- counts once). Helper: clients may not call it.
create function public.catalog_use_count(p_kind text, p_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.recipes r
  where r.ingredients @> jsonb_build_array(
    jsonb_build_object(case p_kind when 'ingredient' then 'ingredient_id' else 'unit_id' end, p_id::text));
$$;

-- The comparison of catalog_suggest (R-019), now with a limit parameter (null = no limit) and the synonyms
-- in the result. catalog_suggest calls it with 5, so its behaviour does not change.
create function public.catalog_match(p_kind text, p_term text, p_autocomplete boolean, p_lang text, p_limit int)
returns table (id uuid, name_nl text, name_fr text, synonyms text[], matched text, match_kind text, distance int, similarity real)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_term text := public.item_key(p_term);
  v_len int;
  v_max int;
  v_items text;
  v_keys text;
  v_fk text;
begin
  if p_lang is null or p_lang not in ('nl', 'fr') then
    raise exception 'language must be nl or fr' using errcode = '22023';
  end if;
  if p_kind not in ('ingredient', 'unit') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if v_term is null or v_term = '' then return; end if;
  v_len := char_length(v_term);
  v_max := public.dl_max_distance(v_len);
  v_items := case p_kind when 'ingredient' then 'ingredients' else 'units' end;
  v_keys := case p_kind when 'ingredient' then 'ingredient_keys' else 'unit_keys' end;
  v_fk := case p_kind when 'ingredient' then 'ingredient_id' else 'unit_id' end;

  return query execute format($q$
    with scored as (
      select k.%3$I as item_id, k.key,
             case when k.key = $1 then 0
                  when $5 is not null and abs(char_length(k.key) - $4) <= $5 then public.dl_distance(k.key, $1)
             end as dist,
             case when k.key = $1 then 1::real else extensions.similarity(k.key, $1) end as sim
      from public.%2$I k
    ), ranked as (
      select s.item_id, s.key, s.dist, s.sim,
             case when s.key = $1 then 0
                  when $2 and $4 >= 2 and left(s.key, $4) = $1 then 1
                  when $4 >= 4 and ((s.dist is not null and s.dist <= $5) or s.sim >= 0.35::real) then 2
             end as rank
      from scored s
    ), best as (
      select distinct on (r.item_id) r.item_id, r.key, r.dist, r.sim, r.rank
      from ranked r
      where r.rank is not null
      order by r.item_id, r.rank, r.dist nulls last, r.sim desc, r.key
    )
    select i.id, i.name_nl, i.name_fr, i.synonyms,
           (select n from unnest(array[i.name_nl, i.name_fr] || i.synonyms) as t(n)
             where n is not null and public.item_key(n) = b.key limit 1) as matched,
           case b.rank when 0 then 'exact' when 1 then 'prefix' else 'similar' end as match_kind,
           b.dist, b.sim
    from best b
    join public.%1$I i on i.id = b.item_id
    order by b.rank, b.dist nulls last, b.sim desc,
             public.item_key(case when $3 = 'nl' then coalesce(i.name_nl, i.name_fr)
                                  else coalesce(i.name_fr, i.name_nl) end),
             i.id
    limit $6
  $q$, v_items, v_keys, v_fk)
  using v_term, p_autocomplete, p_lang, v_len, v_max, p_limit;
end;
$$;

-- Same signature and result as before; only the body moved to catalog_match.
create or replace function public.catalog_suggest(p_kind text, p_term text, p_autocomplete boolean, p_lang text)
returns table (id uuid, name_nl text, name_fr text, matched text, match_kind text, distance int, similarity real)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return query
    select m.id, m.name_nl, m.name_fr, m.matched, m.match_kind, m.distance, m.similarity
    from public.catalog_match(p_kind, p_term, p_autocomplete, p_lang, 5) m;
end;
$$;

-- A reference may not point to an item that is being merged or deleted at this moment: the check takes
-- "for key share", which waits for (or blocks) the "for update" of admin_merge_catalog / admin_delete_catalog.
-- Same function as in recipe_catalog_links, apart from the lock.
create or replace function public.recipes_check_catalog_refs()
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
    if v_id ~ v_uuid then
      perform 1 from public.ingredients i where i.id = v_id::uuid for key share;
      if not found then
        raise exception 'unknown ingredient_id' using errcode = '23503';
      end if;
    end if;
    v_id := case when jsonb_typeof(v_item -> 'unit_id') = 'string' then v_item ->> 'unit_id' end;
    if v_id ~ v_uuid then
      perform 1 from public.units u where u.id = v_id::uuid for key share;
      if not found then
        raise exception 'unknown unit_id' using errcode = '23503';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

-- Administrator's list: all hits (no limit of 5) with the number of recipes that use the item. An empty term
-- gives every item, alphabetical on the name in the interface language (plain byte order of the key).
create function public.admin_list_catalog(p_kind text, p_term text, p_lang text)
returns table (id uuid, name_nl text, name_fr text, synonyms text[], use_count int, matched text, match_kind text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in ('nl', 'fr') then
    raise exception 'language must be nl or fr' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('ingredient', 'unit') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if public.item_key(p_term) is null or public.item_key(p_term) = '' then
    return query execute format($q$
      select i.id, i.name_nl, i.name_fr, i.synonyms, public.catalog_use_count($1, i.id), null::text, null::text
      from public.%I i
      order by public.item_key(case when $2 = 'nl' then coalesce(i.name_nl, i.name_fr)
                                    else coalesce(i.name_fr, i.name_nl) end) collate "C", i.id
    $q$, case p_kind when 'ingredient' then 'ingredients' else 'units' end)
    using p_kind, p_lang;
  else
    return query
      select m.id, m.name_nl, m.name_fr, m.synonyms, public.catalog_use_count(p_kind, m.id), m.matched, m.match_kind
      from public.catalog_match(p_kind, p_term, true, p_lang, null) m;
  end if;
end;
$$;

-- Replaces the names and synonyms of an item. A key that belongs to another item is refused with 23505 and the
-- id of that item in the detail; nothing changes. The triggers normalise, validate (23514) and rebuild the keys.
create function public.admin_update_catalog(
  p_kind text, p_id uuid, p_name_nl text, p_name_fr text, p_synonyms text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n text;
  v_key text;
  v_other uuid;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('ingredient', 'unit') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  foreach v_n in array array[p_name_nl, p_name_fr] || coalesce(p_synonyms, '{}') loop
    v_key := public.item_key(v_n);
    if v_key is null or v_key = '' then continue; end if;
    if p_kind = 'ingredient' then
      select k.ingredient_id into v_other from public.ingredient_keys k where k.key = v_key and k.ingredient_id <> p_id;
    else
      select k.unit_id into v_other from public.unit_keys k where k.key = v_key and k.unit_id <> p_id;
    end if;
    if v_other is not null then
      raise exception 'key already used by another item' using errcode = '23505', detail = v_other::text;
    end if;
  end loop;
  begin
    if p_kind = 'ingredient' then
      update public.ingredients set name_nl = p_name_nl, name_fr = p_name_fr, synonyms = coalesce(p_synonyms, '{}')
      where id = p_id;
    else
      update public.units set name_nl = p_name_nl, name_fr = p_name_fr, synonyms = coalesce(p_synonyms, '{}')
      where id = p_id;
    end if;
  exception when unique_violation then
    -- Someone added the same key between the check above and the update: find the owner and report it the
    -- same way as the check does. This block rolls the failed update back.
    foreach v_n in array array[p_name_nl, p_name_fr] || coalesce(p_synonyms, '{}') loop
      v_key := public.item_key(v_n);
      if v_key is null or v_key = '' then continue; end if;
      if p_kind = 'ingredient' then
        select k.ingredient_id into v_other from public.ingredient_keys k where k.key = v_key and k.ingredient_id <> p_id;
      else
        select k.unit_id into v_other from public.unit_keys k where k.key = v_key and k.unit_id <> p_id;
      end if;
      if v_other is not null then
        raise exception 'key already used by another item' using errcode = '23505', detail = v_other::text;
      end if;
    end loop;
    raise;
  end;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Merges item A into item B in one transaction (no error handling here on purpose: any error rolls back all).
-- Order: re-point the recipes, remove A (its keys go with it), then give A's names and synonyms to B as
-- synonyms. Only the pointer inside the ingredient lines changes; every other field of the recipe stays.
create function public.admin_merge_catalog(p_kind text, p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_field text;
  v_names text[];
  v_locked int;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('ingredient', 'unit') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'cannot merge an item into itself' using errcode = '22023';
  end if;
  v_field := case p_kind when 'ingredient' then 'ingredient_id' else 'unit_id' end;

  -- Fixed order on id, so two merges at once cannot deadlock.
  if p_kind = 'ingredient' then
    select count(*) into v_locked from (
      select 1 from public.ingredients where id in (p_from, p_into) order by id for update) l;
  else
    select count(*) into v_locked from (
      select 1 from public.units where id in (p_from, p_into) order by id for update) l;
  end if;
  if v_locked <> 2 then
    raise exception 'item not found' using errcode = 'P0002';
  end if;

  update public.recipes r
  set ingredients = (
    select jsonb_agg(
             case when e.value ->> v_field = p_from::text
                  then jsonb_set(e.value, array[v_field], to_jsonb(p_into::text))
                  else e.value end
             order by e.ord)
    from jsonb_array_elements(r.ingredients) with ordinality e(value, ord))
  where r.ingredients @> jsonb_build_array(jsonb_build_object(v_field, p_from::text));

  if p_kind = 'ingredient' then
    select array[a.name_nl, a.name_fr] || a.synonyms into v_names from public.ingredients a where a.id = p_from;
    delete from public.ingredients where id = p_from;
    begin
      update public.ingredients b
      set synonyms = b.synonyms || array(select n from unnest(v_names) n where n is not null)
      where b.id = p_into;
    exception when check_violation then
      -- Only this update can break the limit of 20 synonyms; a recipe failing a check above has no such detail.
      raise exception 'too many synonyms after merge' using errcode = '23514', detail = 'too_many_synonyms';
    end;
  else
    select array[a.name_nl, a.name_fr] || a.synonyms into v_names from public.units a where a.id = p_from;
    delete from public.units where id = p_from;
    begin
      update public.units b
      set synonyms = b.synonyms || array(select n from unnest(v_names) n where n is not null)
      where b.id = p_into;
    exception when check_violation then
      raise exception 'too many synonyms after merge' using errcode = '23514', detail = 'too_many_synonyms';
    end;
  end if;
end;
$$;

-- Removes an item that no recipe uses. A used item gives 23503 with the number of recipes in the detail.
create function public.admin_delete_catalog(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found uuid;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('ingredient', 'unit') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if p_kind = 'ingredient' then
    select i.id into v_found from public.ingredients i where i.id = p_id for update;
  else
    select u.id into v_found from public.units u where u.id = p_id for update;
  end if;
  if v_found is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  v_count := public.catalog_use_count(p_kind, p_id);
  if v_count > 0 then
    raise exception 'item is in use' using errcode = '23503', detail = v_count::text;
  end if;
  if p_kind = 'ingredient' then
    delete from public.ingredients where id = p_id;
  else
    delete from public.units where id = p_id;
  end if;
end;
$$;

revoke execute on function
  public.catalog_use_count(text, uuid),
  public.catalog_match(text, text, boolean, text, int),
  public.catalog_suggest(text, text, boolean, text)
  from public, anon, authenticated;
revoke execute on function
  public.admin_list_catalog(text, text, text),
  public.admin_update_catalog(text, uuid, text, text, text[]),
  public.admin_merge_catalog(text, uuid, uuid),
  public.admin_delete_catalog(text, uuid)
  from public, anon;
grant execute on function
  public.admin_list_catalog(text, text, text),
  public.admin_update_catalog(text, uuid, text, text, text[]),
  public.admin_merge_catalog(text, uuid, uuid),
  public.admin_delete_catalog(text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
