-- Delete only the reserved integration fixtures, never application users.
begin;
create temporary table fixture_users(id uuid primary key) on commit drop;
insert into fixture_users values('55555555-5555-4555-8555-555555555555'),('66666666-6666-4666-8666-666666666666'),('77777777-7777-4777-8777-777777777777');
delete from public.budgets where user_id in(select id from fixture_users);
delete from public.savings_goals where user_id in(select id from fixture_users);
delete from public.split_comments where user_id in(select id from fixture_users);
delete from public.group_activity where actor_id in(select id from fixture_users);
-- Archive before membership deletion so the recurring ownership guard is respected.
update public.expense_schedules set status='ARCHIVED' where creator_id in(select id from fixture_users) or group_id in(select id from public.groups where owner_id in(select id from fixture_users));
delete from public.expense_drafts where schedule_id in(select id from public.expense_schedules where creator_id in(select id from fixture_users) or group_id in(select id from public.groups where owner_id in(select id from fixture_users)));
delete from public.expense_schedules where creator_id in(select id from fixture_users) or group_id in(select id from public.groups where owner_id in(select id from fixture_users));
delete from public.split_templates where creator_id in(select id from fixture_users) or group_id in(select id from public.groups where owner_id in(select id from fixture_users));
delete from public.group_join_requests where user_id in(select id from fixture_users) or group_id in(select group_id from public.group_invitations where created_by in(select id from fixture_users));
delete from public.group_invitations where created_by in(select id from fixture_users);
delete from public.transactions where user_id in(select id from fixture_users);
delete from public.split_payers where user_id in(select id from fixture_users);
delete from public.split_participants where user_id in(select id from fixture_users);
delete from public.split_expenses where creator_id in(select id from fixture_users);
delete from public.settlements where payer_id in(select id from fixture_users) or payee_id in(select id from fixture_users);
delete from public.group_members where user_id in(select id from fixture_users);
delete from public.groups where owner_id in(select id from fixture_users);
delete from public.audit_logs where user_id in(select id from fixture_users);
delete from public.reminders where user_id in(select id from fixture_users);
delete from public.categories where user_id in(select id from fixture_users);
delete from public.accounts where user_id in(select id from fixture_users);
delete from auth.users where id in(select id from fixture_users);
commit;
