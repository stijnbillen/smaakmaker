-- T-004 (R-017): administrators, invite management, delete rights on recipes.

-- ---------------------------------------------------------------------------
-- Administrators: a table the client can neither read nor write.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies and no grants: only the functions below (security definer) and service_role touch it.
revoke all on public.admins from anon, authenticated;
grant all on public.admins to service_role;

-- The one door for the client (and for later rules on reviews and photos).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Becoming administrator only works with SQL (SQL editor or psql), never through the API.
create function public.grant_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'no user with address %', p_email;
  end if;
  insert into public.admins (user_id) values (v_id) on conflict do nothing;
end;
$$;

revoke all on function public.grant_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invite codes
-- ---------------------------------------------------------------------------
-- 10 characters from 31 symbols without 0/O and 1/I/L. Rejection sampling (bytes < 248 = 31 x 8)
-- keeps every symbol equally likely.
create function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_out text := '';
  v_bytes bytea;
  v_byte int;
  i int;
begin
  while char_length(v_out) < 10 loop
    v_bytes := extensions.gen_random_bytes(16);
    for i in 0 .. 15 loop
      v_byte := get_byte(v_bytes, i);
      if v_byte < 248 and char_length(v_out) < 10 then
        v_out := v_out || substr(c_alphabet, (v_byte % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- Pure; same boundary as invite_is_valid_at (created_at + 7 days is still open). "gebruikt" beats "verlopen".
create function public.invite_status(created_at timestamptz, used_at timestamptz, at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when invite_status.used_at is not null then 'gebruikt'
    when invite_status.at <= invite_status.created_at + interval '7 days' then 'open'
    else 'verlopen'
  end;
$$;

revoke all on function public.invite_status(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

create function public.create_invite()
returns table (code text, status text, used_by_name text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_code text;
  v_row public.invites;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (code, created_by) values (v_code, auth.uid()) returning * into v_row;
      exit;
    exception when unique_violation then
      -- Collision with an existing code: draw again.
    end;
  end loop;
  return query select v_row.code, public.invite_status(v_row.created_at, v_row.used_at, now()),
    null::text, v_row.created_at + interval '7 days', v_row.created_at;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

create function public.list_invites()
returns table (code text, status text, used_by_name text, expires_at timestamptz, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  return query
    select i.code,
           public.invite_status(i.created_at, i.used_at, now()),
           case when i.used_at is not null then p.display_name end,
           i.created_at + interval '7 days',
           i.created_at
      from public.invites i
      left join public.profiles p on p.id = i.used_by
     order by i.created_at desc;
end;
$$;

revoke all on function public.list_invites() from public, anon;
grant execute on function public.list_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Recipes: the author or an administrator may delete. An administrator gets no update.
-- ---------------------------------------------------------------------------
grant delete on public.recipes to authenticated;

create policy "recipes delete by author or admin"
  on public.recipes for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());
