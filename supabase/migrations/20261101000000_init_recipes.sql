-- Minimal recipes table for T-001 (R-001). Provisional: R-003 extends it with
-- validation, editing and deleting; R-017 adds admin rights.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.recipes enable row level security;

-- No anonymous access at all, also not through default grants.
revoke all on public.recipes from anon;
grant select, insert on public.recipes to authenticated;

-- Signed-in users share one database: everyone reads every recipe.
create policy "recipes readable by signed-in users"
  on public.recipes for select
  to authenticated
  using (true);

-- Insert only as yourself; no update/delete policies yet, so those stay closed.
create policy "recipes insert as author"
  on public.recipes for insert
  to authenticated
  with check (author_id = auth.uid());
