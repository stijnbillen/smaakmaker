-- T-027 (R-027): invitations per e-mail address replace the invite codes.
--
-- Error codes the client recognises (SQLSTATE, raised by invite_user / resend_invitation):
--   42501  not an administrator
--   IV001  invalid e-mail address
--   IV002  the address already has an account
--   IV003  limit reached: 20 sends per administrator per 24 hours
--   IV004  resend_invitation: no open invitation for this address
--
-- The table `invites` (old codes) stays as an archive; nothing is deleted. No function uses it any more.

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------
-- Trim all whitespace at both ends (like String.trim in the client) and lowercase.
create function public.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(p_email, '^\s+|\s+$', '', 'g'));
$$;

-- Same shape as isValidEmail in src/lib/validation.ts; keep the two equal (tests compare them).
create function public.is_valid_email_shape(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_email ~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$', false);
$$;

revoke all on function public.normalize_email(text) from public, anon, authenticated;
revoke all on function public.is_valid_email_shape(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables: closed for the client, only the functions below and service_role touch them
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = public.normalize_email(email) and public.is_valid_email_shape(email)),
  invited_by uuid references public.profiles (id) on delete set null,
  lang text check (lang in ('nl', 'fr')),
  -- Validity runs 7 x 24 h from here; sending again moves it.
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

-- One row per mail send, for the limit of 20 per administrator per 24 hours.
create table public.invitation_sends (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now()
);

create index invitation_sends_admin_sent_idx on public.invitation_sends (admin_id, sent_at);

alter table public.invitations enable row level security;
alter table public.invitation_sends enable row level security;
-- No policies: row-level security then denies everything to the public roles.
revoke all on public.invitations from anon, authenticated;
revoke all on public.invitation_sends from anon, authenticated;
grant all on public.invitations to service_role;
grant all on public.invitation_sends to service_role;

-- Pure validity check: not accepted and not older than 7 x 24 h at the given moment (boundary included).
create function public.invitation_is_valid_at(p_email text, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.invitations i
     where i.email = public.normalize_email(p_email)
       and i.accepted_at is null
       and invitation_is_valid_at.at <= i.sent_at + interval '7 days'
  );
$$;

revoke all on function public.invitation_is_valid_at(text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Existing work in progress: an unconfirmed user with a still valid code keeps access.
-- Other open codes lapse (R-027 replaces them).
-- ---------------------------------------------------------------------------
insert into public.invitations (email, invited_by, sent_at)
select public.normalize_email(u.email),
       (select p.id from public.profiles p where p.id = i.created_by),
       i.created_at
  from auth.users u
  join public.invites i on i.code = u.raw_user_meta_data ->> 'invite_code'
 where u.email_confirmed_at is null
   and u.email is not null
   and public.is_valid_email_shape(public.normalize_email(u.email))
   and i.used_at is null
   and now() <= i.created_at + interval '7 days'
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Triggers on auth.users: no account without a valid invitation, enforced at creation and at confirmation
-- ---------------------------------------------------------------------------
-- Atomic: the update only matches while the invitation is open and not expired; the loser of a race gets no row.
create function public.accept_invitation(p_email text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invitations
     set accepted_at = now(), accepted_by = p_user
   where email = public.normalize_email(p_email)
     and accepted_at is null
     and now() <= sent_at + interval '7 days';
  if not found then
    raise exception 'no valid invitation' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.accept_invitation(text, uuid) from public, anon, authenticated;

create or replace function public.handle_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.invitation_is_valid_at(new.email, now()) then
    raise exception 'no valid invitation' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (new.id);

  -- Created already confirmed (admin API): nobody confirms later, so accept now.
  -- Otherwise it is accepted at confirmation, so a typo in the address does not burn the invitation.
  if new.email_confirmed_at is not null then
    perform public.accept_invitation(new.email, new.id);
  end if;
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Already accepted by this very user (created confirmed): nothing left to do.
  if exists (select 1 from public.invitations where accepted_by = new.id) then
    return new;
  end if;
  perform public.accept_invitation(new.email, new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove the invite codes (functions and triggers; the table `invites` stays)
-- ---------------------------------------------------------------------------
drop trigger invites_drop_stale_pending on public.invites;
drop function public.invites_changed();
drop function public.drop_stale_pending_users();
drop function public.refresh_pending_invite(text, text);
drop function public.check_invite(text);
drop function public.create_invite();
drop function public.list_invites();
drop function public.consume_invite(text, uuid);
drop function public.invite_is_valid_at(text, timestamptz);
drop function public.invite_status(timestamptz, timestamptz, timestamptz);
drop function public.generate_invite_code();

-- ---------------------------------------------------------------------------
-- The administrator's functions
-- ---------------------------------------------------------------------------
create type public.invitation_result as (email text, sent_at timestamptz, expires_at timestamptz);

-- Shared by invite_user and resend_invitation. Not callable by the client.
create function public.send_invitation(p_email text, p_lang text, p_must_be_open boolean)
returns public.invitation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.normalize_email(p_email);
  v_lang text := case when p_lang in ('nl', 'fr') then p_lang end;
  v_admin uuid := auth.uid();
  v_sent timestamptz;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if not public.is_valid_email_shape(v_email) then
    raise exception 'invalid e-mail address' using errcode = 'IV001';
  end if;
  if exists (select 1 from auth.users u where public.normalize_email(u.email) = v_email and u.email_confirmed_at is not null) then
    raise exception 'address already has an account' using errcode = 'IV002';
  end if;
  if p_must_be_open and not exists (select 1 from public.invitations i where i.email = v_email and i.accepted_at is null) then
    raise exception 'no open invitation' using errcode = 'IV004';
  end if;

  -- One send at a time per administrator, so two parallel calls at 19 cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('invitation_sends:' || v_admin::text, 0));
  if (select count(*) from public.invitation_sends s
       where s.admin_id = v_admin and s.sent_at >= now() - interval '24 hours') >= 20 then
    raise exception 'invitation limit reached' using errcode = 'IV003';
  end if;

  -- A new, open or expired invitation gets a fresh sent_at (7 days start again). An accepted row without
  -- a confirmed user (the user was deleted) is revived the same way.
  insert into public.invitations as i (email, invited_by, lang, sent_at)
  values (v_email, v_admin, v_lang, now())
  on conflict (email) do update
    set sent_at = now(), lang = excluded.lang, invited_by = excluded.invited_by,
        accepted_at = null, accepted_by = null
  returning i.sent_at into v_sent;

  insert into public.invitation_sends (admin_id, email) values (v_admin, v_email);

  -- An unconfirmed user for this address already exists: the next mail must follow the new language,
  -- and GoTrue does not rewrite the metadata on a repeated request.
  if v_lang is not null then
    update auth.users u
       set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('lang', v_lang)
     where public.normalize_email(u.email) = v_email and u.email_confirmed_at is null;
  end if;

  return row(v_email, v_sent, v_sent + interval '7 days')::public.invitation_result;
end;
$$;

revoke all on function public.send_invitation(text, text, boolean) from public, anon, authenticated;

create function public.invite_user(p_email text, p_lang text default null)
returns public.invitation_result
language sql
security definer
set search_path = ''
as $$
  select public.send_invitation(p_email, p_lang, false);
$$;

create function public.resend_invitation(p_email text, p_lang text default null)
returns public.invitation_result
language sql
security definer
set search_path = ''
as $$
  select public.send_invitation(p_email, p_lang, true);
$$;

-- Withdraws an invitation and removes the unconfirmed user created for it, so an earlier code stops working.
create function public.revoke_invitation(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.normalize_email(p_email);
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  delete from auth.users u where public.normalize_email(u.email) = v_email and u.email_confirmed_at is null;
  delete from public.invitations i where i.email = v_email and i.accepted_at is null;
end;
$$;

create function public.list_invitations()
returns table (email text, sent_at timestamptz, expires_at timestamptz)
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
    select i.email, i.sent_at, i.sent_at + interval '7 days'
      from public.invitations i
     where i.accepted_at is null
       and now() <= i.sent_at + interval '7 days'
     order by i.sent_at desc;
end;
$$;

revoke all on function public.invite_user(text, text) from public, anon;
revoke all on function public.resend_invitation(text, text) from public, anon;
revoke all on function public.revoke_invitation(text) from public, anon;
revoke all on function public.list_invitations() from public, anon;
grant execute on function public.invite_user(text, text) to authenticated;
grant execute on function public.resend_invitation(text, text) to authenticated;
grant execute on function public.revoke_invitation(text) to authenticated;
grant execute on function public.list_invitations() to authenticated;
