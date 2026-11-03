-- T-003 review fix: refresh_pending_invite only clears the address that asks.
--
-- The function does not replace a stored code. It removes the unconfirmed user of p_email when the
-- code that user was created with is no longer valid (spent or expired), so the sign-up request that
-- follows creates a fresh user with the new code. Other addresses are left alone; the statement-level
-- trigger on invites still sweeps everything on explicit changes.
create or replace function public.refresh_pending_invite(p_email text, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only someone holding a valid code may trigger the cleanup. Silent, so it reveals nothing.
  if p_email is null or p_code is null or not public.invite_is_valid_at(p_code, now()) then
    return;
  end if;
  delete from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and u.email_confirmed_at is null
     and not public.invite_is_valid_at(coalesce(u.raw_user_meta_data ->> 'invite_code', ''), now());
end;
$$;
