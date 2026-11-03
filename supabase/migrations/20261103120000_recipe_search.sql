-- T-015 (R-009): search recipes on ingredients. "At least k of n terms", optional "without" terms.
-- security invoker: the select policies on recipes and profiles decide what a user sees.
-- strpos on fold_key() instead of LIKE: '%' and '_' are plain characters, case and accents do not count.

create function public.search_recipes(
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
  term_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_terms text[];
  v_without text[];
  v_n integer;
  v_k integer;
begin
  -- Normalise: fold, drop empty keys, de-duplicate. n counts unique terms only.
  select coalesce(array_agg(distinct q.k), '{}') into v_terms
    from (select public.fold_key(x) as k from unnest(coalesce(p_terms, '{}')) as x) q
   where q.k is not null and q.k <> '';
  select coalesce(array_agg(distinct q.k), '{}') into v_without
    from (select public.fold_key(x) as k from unnest(coalesce(p_without, '{}')) as x) q
   where q.k is not null and q.k <> '';

  v_n := cardinality(v_terms);
  if v_n > 10 then
    raise exception 'at most 10 search terms' using errcode = '22023';
  end if;
  if cardinality(v_without) > 10 then
    raise exception 'at most 10 without terms' using errcode = '22023';
  end if;

  v_k := coalesce(p_min, v_n);
  if v_n > 0 and (v_k < 1 or v_k > v_n) then
    raise exception 'minimum must be between 1 and %', v_n using errcode = '22023';
  end if;

  return query
  select r.id, r.title, r.created_at, r.prep_minutes, r.total_minutes, r.equipment, r.dish_tags, r.trait_tags,
         r.photos, r.family_id, public.rating_avg(r), public.rating_count(r), p.display_name,
         m.cnt, v_n
    from public.recipes r
    left join public.profiles p on p.id = r.author_id
    cross join lateral (
      select count(*)::integer as cnt
        from unnest(v_terms) as t(k)
       where exists (
         select 1
           from jsonb_array_elements(case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end) as i
          where strpos(public.fold_key(i ->> 'name'), t.k) > 0
       )
    ) m
   where (v_n = 0 or m.cnt >= v_k)
     and not exists (
       select 1
         from unnest(v_without) as w(k),
              jsonb_array_elements(case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end) as i
        where strpos(public.fold_key(i ->> 'name'), w.k) > 0
     )
   order by m.cnt desc, r.created_at desc;
end;
$$;

revoke execute on function public.search_recipes(text[], text[], integer) from public, anon;
grant execute on function public.search_recipes(text[], text[], integer) to authenticated;

notify pgrst, 'reload schema';
