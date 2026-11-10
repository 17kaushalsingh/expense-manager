-- Defense in depth: snapshots are private and no client role has table grants.
create policy deny_client_snapshots on private.deleted_splits
 for all to authenticated using(false) with check(false);
