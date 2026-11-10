-- T-028: pre-check for sign-in. Tells the client whether a mail may be sent, without exposing any other data.
-- Only a convenience for a clear message; the real lock stays in the triggers on auth.users.
create function public.sign_in_status(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.normalize_email(p_email);
begin
  if v_email is null or not public.is_valid_email_shape(v_email) then
    return 'unknown';
  end if;

  if exists (select 1 from auth.users u where public.normalize_email(u.email) = v_email and u.email_confirmed_at is not null) then
    return 'member';
  end if;

  if public.invitation_is_valid_at(v_email, now()) then
    return 'invited';
  end if;

  -- Invitation expired, revoked or never there: drop a leftover unconfirmed user,
  -- so GoTrue sends no mail either on a direct signInWithOtp (otp_disabled).
  delete from auth.users u where public.normalize_email(u.email) = v_email and u.email_confirmed_at is null;
  return 'unknown';
end;
$$;

revoke all on function public.sign_in_status(text) from public;
grant execute on function public.sign_in_status(text) to anon, authenticated;
