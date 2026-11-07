-- T-020 (R-019): closeness of a typed term to catalogue items (typos, other spellings, completion).
-- All comparing happens on item_key() keys, over both languages and all synonyms.

create extension if not exists pg_trgm with schema extensions;

-- Restricted Damerau-Levenshtein (optimal string alignment): insert, delete, replace and swap of two
-- neighbouring characters cost 1 each. Works per character (not per byte).
create function public.dl_distance(a text, b text)
returns int
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  ca text[] := string_to_array(a, null);
  cb text[] := string_to_array(b, null);
  m int := coalesce(array_length(ca, 1), 0);
  n int := coalesce(array_length(cb, 1), 0);
  w int := n + 1;
  d int[];
  i int;
  j int;
  cost int;
  v int;
begin
  if m = 0 then return n; end if;
  if n = 0 then return m; end if;
  -- (m+1) x (n+1) matrix, flattened: cell (i, j) lives at i * w + j + 1.
  d := array_fill(0, array[(m + 1) * w]);
  for i in 0..m loop d[i * w + 1] := i; end loop;
  for j in 0..n loop d[j + 1] := j; end loop;
  for i in 1..m loop
    for j in 1..n loop
      cost := case when ca[i] = cb[j] then 0 else 1 end;
      v := least(d[(i - 1) * w + j + 1] + 1, d[i * w + j] + 1, d[(i - 1) * w + j] + cost);
      if i > 1 and j > 1 and ca[i] = cb[j - 1] and ca[i - 1] = cb[j] then
        v := least(v, d[(i - 2) * w + j - 1] + 1);
      end if;
      d[i * w + j + 1] := v;
    end loop;
  end loop;
  return d[m * w + n + 1];
end;
$$;

-- Largest distance that still counts as "close" for a term of p_len characters; null: no close matches.
create function public.dl_max_distance(p_len int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_len >= 10 then 3 when p_len >= 6 then 2 when p_len >= 4 then 1 end;
$$;

-- Shared search. Security definer on purpose: the pure functions and this one must not be callable by clients
-- (so authenticated has no execute right on them), yet the public wrappers have to reach them. The wrappers
-- check that the caller is signed in; the catalogue itself is readable by every signed-in user.
create function public.catalog_suggest(p_kind text, p_term text, p_autocomplete boolean, p_lang text)
returns table (id uuid, name_nl text, name_fr text, matched text, match_kind text, distance int, similarity real)
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
    select i.id, i.name_nl, i.name_fr,
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
    limit 5
  $q$, v_items, v_keys, v_fk)
  using v_term, p_autocomplete, p_lang, v_len, v_max;
end;
$$;

create function public.suggest_ingredients(p_term text, p_autocomplete boolean, p_lang text)
returns table (id uuid, name_nl text, name_fr text, matched text, match_kind text, distance int, similarity real)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query select * from public.catalog_suggest('ingredient', p_term, p_autocomplete, p_lang);
end;
$$;

create function public.suggest_units(p_term text, p_autocomplete boolean, p_lang text)
returns table (id uuid, name_nl text, name_fr text, matched text, match_kind text, distance int, similarity real)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query select * from public.catalog_suggest('unit', p_term, p_autocomplete, p_lang);
end;
$$;

revoke execute on function
  public.dl_distance(text, text), public.dl_max_distance(int),
  public.catalog_suggest(text, text, boolean, text),
  public.suggest_ingredients(text, boolean, text), public.suggest_units(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.suggest_ingredients(text, boolean, text), public.suggest_units(text, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';
