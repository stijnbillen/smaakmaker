-- T-003 (R-002): sign-up only with an invite code, display names, author names on recipes.

-- ---------------------------------------------------------------------------
-- Invites: closed for the client. Admin rights come with the admin task.
-- ---------------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  -- "Used" is judged on used_at, not used_by: deleting the user nulls used_by, which must not revive the code.
  used_at timestamptz
);

alter table public.invites enable row level security;
-- No policies: row-level security then denies everything to the public roles.
revoke all on public.invites from anon, authenticated;
grant all on public.invites to service_role;

-- Pure validity check: unused and not older than 7 x 24 h at the given moment (boundary included).
create function public.invite_is_valid_at(code text, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.invites i
    where i.code = invite_is_valid_at.code
      and i.used_at is null
      and invite_is_valid_at.at <= i.created_at + interval '7 days'
  );
$$;

revoke all on function public.invite_is_valid_at(text, timestamptz) from public, anon, authenticated;

-- Yes/no only, so the client can show a clear message before a mail is sent.
-- Security definer because the client cannot read invites; returns nothing but a boolean.
create function public.check_invite(code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.invite_is_valid_at(check_invite.code, now());
$$;

revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: one per user, holds the display name.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 40),
  created_at timestamptz not null default now()
);

-- Trim before the check runs, so the length counts without spaces at both ends.
create function public.trim_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  return new;
end;
$$;

create trigger profiles_trim_display_name
  before insert or update on public.profiles
  for each row execute function public.trim_display_name();

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant all on public.profiles to service_role;
grant select on public.profiles to authenticated;
-- Column privilege: the client can change the name and nothing else.
grant update (display_name) on public.profiles to authenticated;

create policy "profiles readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles update own row"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Invite enforcement on auth.users, so a direct API call without a code gives no account either.
-- ---------------------------------------------------------------------------

-- Atomic: the update only matches while the code is unused and not expired; the loser of a race gets no row.
create function public.consume_invite(p_code text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites
     set used_by = p_user, used_at = now()
   where code = p_code
     and used_at is null
     and now() <= created_at + interval '7 days';
  if not found then
    raise exception 'invalid invite code' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.consume_invite(text, uuid) from public, anon, authenticated;

create function public.handle_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := new.raw_user_meta_data ->> 'invite_code';
begin
  if v_code is null or not public.invite_is_valid_at(v_code, now()) then
    raise exception 'invalid invite code' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (new.id);

  -- Created already confirmed (admin API): nobody confirms later, so spend the code now.
  -- Otherwise it is spent at confirmation, so a typo in the address does not burn the code.
  if new.email_confirmed_at is not null then
    perform public.consume_invite(v_code, new.id);
  end if;
  return new;
end;
$$;

create function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Already spent by this very user (created confirmed): nothing left to do.
  if exists (select 1 from public.invites where used_by = new.id) then
    return new;
  end if;
  perform public.consume_invite(new.raw_user_meta_data ->> 'invite_code', new.id);
  return new;
end;
$$;

revoke all on function public.handle_user_created() from public, anon, authenticated;
revoke all on function public.handle_user_confirmed() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_user_created();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- ---------------------------------------------------------------------------
-- Existing rows (stepwise, nothing is dropped): give every user a profile, then let
-- recipes point to the profile so the overview can embed the author's name.
-- ---------------------------------------------------------------------------
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

alter table public.recipes
  add constraint recipes_author_profile_fkey
  foreign key (author_id) references public.profiles (id) on delete cascade;
