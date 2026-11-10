-- Personal organization has no effect on group membership or accounting.
create table public.group_preferences (
 user_id uuid not null references public.users on delete cascade,
 group_id uuid not null references public.groups on delete cascade,
 archived boolean not null default false,
 primary key(user_id,group_id)
);
create index group_preferences_group on public.group_preferences(group_id);
alter table public.group_preferences enable row level security;
revoke all on public.group_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.group_preferences to authenticated;
create policy own_group_preferences on public.group_preferences for all to authenticated
 using(user_id=(select auth.uid()) and private.is_member(group_id))
 with check(user_id=(select auth.uid()) and private.is_member(group_id));
