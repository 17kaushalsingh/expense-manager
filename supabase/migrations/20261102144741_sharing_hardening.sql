-- Explicitly document deny-all access for the private rate-limit store.
revoke all on private.invitation_limits from public,anon,authenticated;
create policy no_client_rate_limits on private.invitation_limits for all to authenticated using(false) with check(false);

