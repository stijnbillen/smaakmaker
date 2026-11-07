-- T-024 (R-021): ingredient search with synonyms. A term that is exactly a name or synonym of a catalogue item
-- (by item_key) finds every recipe with that item, whatever the language or the text of the line. The old
-- "part of the name" search stays. search_recipes keeps its signature and result type.

create or replace function public.search_recipes(
  p_terms text[],
  p_without text[] default '{}',
  p_min integer default null
)
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  prep_minutes integer,
  total_minutes integer,
  equipment text[],
  dish_tags text[],
  trait_tags text[],
  photos jsonb,
  family_id uuid,
  rating_avg numeric,
  rating_count integer,
  author_name text,
  match_count integer,
  term_count integer,
  is_favorite boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tk text[];      -- unique fold keys of the "with" terms
  v_ti uuid[];      -- catalogue item of each term (null: no exact hit)
  v_tg text[];      -- group of each term: the item, or else the key itself
  v_wk text[];
  v_wi uuid[];
  v_unique integer; -- unique keys, before terms for one item are merged
  v_n integer;      -- groups
  v_k integer;
begin
  -- Normalise: fold, drop empty keys, de-duplicate. The first spelling of a key finds the item.
  select coalesce(array_agg(q.fk order by q.fk), '{}'), coalesce(array_agg(q.item order by q.fk), '{}'),
         coalesce(array_agg(coalesce(q.item::text, q.fk) order by q.fk), '{}')
    into v_tk, v_ti, v_tg
    from (
      select distinct on (public.fold_key(x)) public.fold_key(x) as fk,
             (select ik.ingredient_id from public.ingredient_keys ik where ik.key = public.item_key(x)) as item
        from unnest(coalesce(p_terms, '{}')) as x
       where public.fold_key(x) is not null and public.fold_key(x) <> ''
       order by public.fold_key(x)
    ) q;
  select coalesce(array_agg(q.fk order by q.fk), '{}'), coalesce(array_agg(q.item order by q.fk), '{}')
    into v_wk, v_wi
    from (
      select distinct on (public.fold_key(x)) public.fold_key(x) as fk,
             (select ik.ingredient_id from public.ingredient_keys ik where ik.key = public.item_key(x)) as item
        from unnest(coalesce(p_without, '{}')) as x
       where public.fold_key(x) is not null and public.fold_key(x) <> ''
       order by public.fold_key(x)
    ) q;

  v_unique := cardinality(v_tk);
  if v_unique > 10 then
    raise exception 'at most 10 search terms' using errcode = '22023';
  end if;
  if cardinality(v_wk) > 10 then
    raise exception 'at most 10 without terms' using errcode = '22023';
  end if;
  select count(distinct g) into v_n from unnest(v_tg) as g;

  -- The minimum is checked against the unique keys; merging terms for one item only brings it down to n,
  -- so a race between "Minstens" and the merge never gives an error.
  if v_unique > 0 and p_min is not null and (p_min < 1 or p_min > v_unique) then
    raise exception 'minimum must be between 1 and %', v_unique using errcode = '22023';
  end if;
  v_k := least(coalesce(p_min, v_n), v_n);

  return query
  select r.id, r.title, r.created_at, r.prep_minutes, r.total_minutes, r.equipment, r.dish_tags, r.trait_tags,
         r.photos, r.family_id, public.rating_avg(r), public.rating_count(r), p.display_name,
         m.cnt, v_n, public.is_favorite(r)
    from public.recipes r
    left join public.profiles p on p.id = r.author_id
    cross join lateral (
      -- Groups and keys are worked out once above; here each line is looked at once per recipe: its own key,
      -- the item it is linked to, the item its text names, and the current names of the linked item.
      with ln as (
        select public.fold_key(i ->> 'name') as fk,
               b.iid,
               (select ik.ingredient_id from public.ingredient_keys ik where ik.key = public.item_key(i ->> 'name')) as nameitem,
               public.fold_key(ing.name_nl) as nl,
               public.fold_key(ing.name_fr) as fr
          from jsonb_array_elements(case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end) as i
          cross join lateral (
            select case when jsonb_typeof(i -> 'ingredient_id') = 'string' then (i ->> 'ingredient_id')::uuid end as iid
          ) b
          left join public.ingredients ing on ing.id = b.iid
      )
      select (
               select count(distinct t.g)::integer
                 from unnest(v_tk, v_ti, v_tg) as t(k, item, g)
                where exists (
                  select 1 from ln
                   where (t.item is not null and (ln.iid = t.item or ln.nameitem = t.item))
                      or strpos(ln.fk, t.k) > 0
                      or strpos(ln.nl, t.k) > 0
                      or strpos(ln.fr, t.k) > 0
                )
             ) as cnt,
             exists (
               select 1
                 from unnest(v_wk, v_wi) as w(k, item)
                where exists (
                  select 1 from ln
                   where (w.item is not null and (ln.iid = w.item or ln.nameitem = w.item))
                      or strpos(ln.fk, w.k) > 0
                      or strpos(ln.nl, w.k) > 0
                      or strpos(ln.fr, w.k) > 0
                )
             ) as excluded
    ) m
   where (v_n = 0 or m.cnt >= v_k)
     and not m.excluded
   order by m.cnt desc, r.created_at desc;
end;
$$;

revoke execute on function public.search_recipes(text[], text[], integer) from public, anon;
grant execute on function public.search_recipes(text[], text[], integer) to authenticated;

-- Per term: the exact catalogue item, or else the best "similar" suggestion (R-019, without "begins with").
-- Security definer like suggest_ingredients: catalog_suggest is not callable by clients.
create function public.search_term_info(p_terms text[], p_lang text)
returns table (term text, item_id uuid, suggestion_id uuid, suggestion_name text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in ('nl', 'fr') then
    raise exception 'language must be nl or fr' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_terms, '{}')) > 20 then
    raise exception 'at most 20 terms' using errcode = '22023';
  end if;

  return query
  select x.t,
         (select ik.ingredient_id from public.ingredient_keys ik where ik.key = public.item_key(x.t)),
         s.id,
         case when s.id is null then null
              when p_lang = 'nl' then coalesce(s.name_nl, s.name_fr)
              else coalesce(s.name_fr, s.name_nl) end
    from unnest(coalesce(p_terms, '{}')) as x(t)
    left join lateral (
      select c.id, c.name_nl, c.name_fr
        from public.catalog_suggest('ingredient', x.t, false, p_lang) c
       where c.match_kind = 'similar'
         and not exists (select 1 from public.ingredient_keys ik where ik.key = public.item_key(x.t))
       limit 1
    ) s on true;
end;
$$;

revoke execute on function public.search_term_info(text[], text) from public, anon;
grant execute on function public.search_term_info(text[], text) to authenticated;

notify pgrst, 'reload schema';
