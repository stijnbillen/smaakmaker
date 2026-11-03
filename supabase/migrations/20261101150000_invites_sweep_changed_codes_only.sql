-- T-003 review fix: a change to an invite only clears pending users that hold THAT code.
--
-- The earlier statement trigger swept every unconfirmed user with an invalid code whenever any invite
-- was updated (e.g. someone else confirming). That removed unrelated addresses whose own code had
-- merely expired. A transition table limits the sweep to the codes touched by the statement.
drop trigger invites_drop_stale_pending on public.invites;
drop function public.invites_changed();

create function public.invites_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users u
   where u.email_confirmed_at is null
     and u.raw_user_meta_data ->> 'invite_code' in (select n.code from changed_invites n)
     and not public.invite_is_valid_at(coalesce(u.raw_user_meta_data ->> 'invite_code', ''), now());
  return null;
end;
$$;

revoke all on function public.invites_changed() from public, anon, authenticated;

create trigger invites_drop_stale_pending
  after update on public.invites
  referencing new table as changed_invites
  for each statement execute function public.invites_changed();
