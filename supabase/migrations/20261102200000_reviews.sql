-- T-016 (R-012): reviews. A separate table, so a review never touches the recipe row
-- (and never counts towards the 2 MB limit of a recipe).

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  -- char_length counts code points; the trigger below trims before this check runs.
  body text check (body is null or char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, author_id)
);

-- The list on the detail page: newest first per recipe.
create index reviews_recipe_created_idx on public.reviews (recipe_id, created_at desc);

-- Trim the text, turn an empty text into null, stamp updated_at on edits.
create function public.reviews_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := nullif(btrim(new.body, E' \t\r\n'), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger reviews_normalize
  before insert or update on public.reviews
  for each row execute function public.reviews_normalize();

alter table public.reviews enable row level security;

-- Revoke first: without it the column grants below would limit nothing (table-wide default grants).
revoke all on public.reviews from anon, authenticated;
grant select, delete on public.reviews to authenticated;
grant insert (recipe_id, rating, body) on public.reviews to authenticated;
grant update (rating, body) on public.reviews to authenticated;

create policy "reviews readable by signed-in users"
  on public.reviews for select
  to authenticated
  using (true);

create policy "reviews insert as author"
  on public.reviews for insert
  to authenticated
  with check (author_id = auth.uid());

-- Only the author edits; an administrator gets no update, like with recipes.
create policy "reviews update by author"
  on public.reviews for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "reviews delete by author or admin"
  on public.reviews for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Computed fields for PostgREST: select/order on rating_avg and rating_count of recipes.
-- Functions, not columns: the recipe row stays untouched when a review is added.
create function public.rating_avg(r public.recipes)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(avg(v.rating)::numeric, 1) from public.reviews v where v.recipe_id = r.id;
$$;

create function public.rating_count(r public.recipes)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from public.reviews v where v.recipe_id = r.id;
$$;

revoke all on function public.rating_avg(public.recipes) from public, anon;
revoke all on function public.rating_count(public.recipes) from public, anon;
grant execute on function public.rating_avg(public.recipes) to authenticated;
grant execute on function public.rating_count(public.recipes) to authenticated;

notify pgrst, 'reload schema';
