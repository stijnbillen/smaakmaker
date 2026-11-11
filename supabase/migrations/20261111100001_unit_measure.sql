-- T-032 (R-033): every unit gets a kind (volume, weight or none) and, for volume and weight, a factor to
-- ml or g. Existing units (also those added by users) become `none`; recipes are not touched.

-- `numeric` without scale on purpose: numeric(9,3) would round 1.2345 to 1.235 instead of refusing it.
alter table public.units
  add column measure text not null default 'none',
  add column factor numeric;

-- The `is not null` parts matter: a check passes on null, so `volume` without factor would slip through.
alter table public.units
  add constraint units_measure_valid check (
    (measure = 'none' and factor is null)
    or (measure in ('volume', 'weight') and factor is not null
        and factor > 0 and factor <= 100000 and factor = round(factor, 3))
  );

-- Starting list. A missing key is skipped (no row matches). mg and koffielepel stay `none` on purpose (R-033).
update public.units u
set measure = v.measure, factor = v.factor
from (values
  ('g', 'weight', 1::numeric), ('kg', 'weight', 1000), ('ml', 'volume', 1), ('cl', 'volume', 10),
  ('dl', 'volume', 100), ('l', 'volume', 1000), ('el', 'volume', 15), ('tl', 'volume', 5)
) as v(key, measure, factor)
join public.unit_keys k on k.key = v.key
where u.id = k.unit_id;

-- Everyone signed in may add a unit with kind and factor, as they may add a name. Nobody gets update rights:
-- changing goes through admin_update_catalog.
grant insert (measure, factor) on public.units to authenticated;

-- Same as add_unit(name, lang), with kind and factor. No default values, so a call with two parameters
-- always means the old function. A known key returns the existing unit and leaves its kind alone.
create function public.add_unit(p_name text, p_lang text, p_measure text, p_factor numeric)
returns table (id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lang is null or p_lang not in ('nl', 'fr') then
    raise exception 'language must be nl or fr' using errcode = '22023';
  end if;
  select k.unit_id into v_id from public.unit_keys k where k.key = public.item_key(p_name);
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;
  begin
    if p_lang = 'nl' then
      insert into public.units (name_nl, measure, factor) values (p_name, p_measure, p_factor) returning units.id into v_id;
    else
      insert into public.units (name_fr, measure, factor) values (p_name, p_measure, p_factor) returning units.id into v_id;
    end if;
    return query select v_id, true;
  exception when unique_violation then
    select k.unit_id into v_id from public.unit_keys k where k.key = public.item_key(p_name);
    if v_id is null then raise; end if;
    return query select v_id, false;
  end;
end;
$$;

revoke execute on function public.add_unit(text, text, text, numeric) from public, anon;
grant execute on function public.add_unit(text, text, text, numeric) to authenticated;

-- The administrator's list gets measure and factor (null for ingredients).
drop function public.admin_list_catalog(text, text, text);
create function public.admin_list_catalog(p_kind text, p_term text, p_lang text)
returns table (id uuid, name_nl text, name_fr text, synonyms text[], use_count int, matched text, match_kind text,
               measure text, factor numeric)
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
      select i.id, i.name_nl, i.name_fr, i.synonyms, public.catalog_use_count($1, i.id), null::text, null::text,
             %s, %s
      from public.%I i
      order by public.item_key(case when $2 = 'nl' then coalesce(i.name_nl, i.name_fr)
                                    else coalesce(i.name_fr, i.name_nl) end) collate "C", i.id
    $q$,
      case p_kind when 'unit' then 'i.measure' else 'null::text' end,
      case p_kind when 'unit' then 'i.factor' else 'null::numeric' end,
      case p_kind when 'ingredient' then 'ingredients' else 'units' end)
    using p_kind, p_lang;
  else
    return query
      select m.id, m.name_nl, m.name_fr, m.synonyms, public.catalog_use_count(p_kind, m.id), m.matched, m.match_kind,
             case when p_kind = 'unit' then u.measure end, case when p_kind = 'unit' then u.factor end
      from public.catalog_match(p_kind, p_term, true, p_lang, null) m
      left join public.units u on p_kind = 'unit' and u.id = m.id;
  end if;
end;
$$;

-- admin_update_catalog with kind and factor. For a unit, p_measure = null means "leave kind and factor alone";
-- otherwise both are set (the check constraint refuses bad combinations with 23514). An ingredient has no kind.
drop function public.admin_update_catalog(text, uuid, text, text, text[]);
create function public.admin_update_catalog(
  p_kind text, p_id uuid, p_name_nl text, p_name_fr text, p_synonyms text[],
  p_measure text default null, p_factor numeric default null)
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
  if p_kind = 'ingredient' and p_measure is not null then
    raise exception 'an ingredient has no kind' using errcode = '22023';
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
      update public.units
      set name_nl = p_name_nl, name_fr = p_name_fr, synonyms = coalesce(p_synonyms, '{}'),
          measure = coalesce(p_measure, measure),
          factor = case when p_measure is null then factor else p_factor end
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

-- Dropping a function drops its grants: set them again, as in catalog_admin.
revoke execute on function
  public.admin_list_catalog(text, text, text),
  public.admin_update_catalog(text, uuid, text, text, text[], text, numeric)
  from public, anon;
grant execute on function
  public.admin_list_catalog(text, text, text),
  public.admin_update_catalog(text, uuid, text, text, text[], text, numeric)
  to authenticated;

notify pgrst, 'reload schema';
