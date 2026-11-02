-- T-011 (R-011): second tag group "trait" (season, diet, style) with the same mechanism as dish tags.
-- resolve_tags(), fold_key() and the dish trigger stay untouched; unique (kind, name_key) lets the same
-- name exist in both groups.

alter table public.tags drop constraint tags_kind_check;
alter table public.tags add constraint tags_kind_check check (kind in ('dish', 'trait'));

-- Start list; safe to run again.
insert into public.tags (kind, name, name_key)
select 'trait', n, public.fold_key(n)
from unnest(array['winter', 'zomer', 'lente', 'herfst', 'licht', 'vegetarisch', 'veganistisch', 'glutenvrij', 'snel']) n
on conflict (kind, name_key) do nothing;

alter table public.recipes add column trait_tags text[] not null default '{}';
create index recipes_trait_tags_idx on public.recipes using gin (trait_tags);

create function public.recipes_resolve_trait_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.trait_tags := public.resolve_tags('trait', coalesce(new.trait_tags, '{}'));
  return new;
end;
$$;
revoke execute on function public.recipes_resolve_trait_tags() from public, anon, authenticated;

create trigger recipes_resolve_trait_tags
  before insert or update of trait_tags on public.recipes
  for each row execute function public.recipes_resolve_trait_tags();

-- The author may change it; the update policy itself stays as it is (author only).
grant update (trait_tags) on public.recipes to authenticated;
