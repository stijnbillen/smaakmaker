-- T-003 review fix: an unconfirmed user must be able to start over with a new invite code.
--
-- Supabase creates the auth.users row when the mail is sent, with the code of the first request in
-- raw_user_meta_data. A repeated request for an existing address does not rewrite that metadata
-- (checked against the pinned GoTrue: only confirmation_sent_at changes), so if the first code was
-- spent or expired the address could never confirm. The fix is to not leave such rows behind:
-- a pending user whose stored code is no longer valid is removed, so the next request creates a
-- fresh user with the new code. Confirmed users are never touched.
create function public.drop_stale_pending_users()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users u
   where u.email_confirmed_at is null
     and not public.invite_is_valid_at(coalesce(u.raw_user_meta_data ->> 'invite_code', ''), now());
$$;

revoke all on function public.drop_stale_pending_users() from public, anon, authenticated;

-- Statement level: runs on any change of an invite (spent, or expiry moved), before the next request.
create function public.invites_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.drop_stale_pending_users();
  return null;
end;
$$;

revoke all on function public.invites_changed() from public, anon, authenticated;

create trigger invites_drop_stale_pending
  after update on public.invites
  for each statement execute function public.invites_changed();

-- Called by the client before a sign-up request. Expiry has no database event of its own, so this
-- sweeps rows whose code ran out in the meantime. Silent, so it reveals nothing about addresses.
create function public.refresh_pending_invite(p_email text, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code is null or not public.invite_is_valid_at(p_code, now()) then
    return;
  end if;
  perform public.drop_stale_pending_users();
end;
$$;

revoke all on function public.refresh_pending_invite(text, text) from public;
grant execute on function public.refresh_pending_invite(text, text) to anon, authenticated;
