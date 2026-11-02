create table public.expense_schedules (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.groups on delete cascade,
 template_id uuid not null references public.split_templates,creator_id uuid not null references public.users,
 frequency text not null check(frequency in ('WEEKLY','MONTHLY','YEARLY')), start_date date not null,end_date date,
 timezone text not null,status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','ARCHIVED')),
 next_index int not null default 0 check(next_index>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date)
);
create index schedules_group on public.expense_schedules(group_id);
create index schedules_template on public.expense_schedules(template_id);
create index schedules_creator on public.expense_schedules(creator_id);
create table public.expense_drafts (
 id uuid primary key default gen_random_uuid(),schedule_id uuid not null references public.expense_schedules on delete cascade,
 group_id uuid not null references public.groups on delete cascade,due_date date not null,timezone text not null,payload jsonb not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','POSTED','SKIPPED')),
 expense_id uuid references public.split_expenses on delete set null,posted_by uuid references public.users,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(schedule_id,due_date)
);
create index drafts_group on public.expense_drafts(group_id);
create index drafts_expense on public.expense_drafts(expense_id);
create index drafts_poster on public.expense_drafts(posted_by);
create trigger touch_updated before update on public.expense_schedules for each row execute function private.touch_updated();
create trigger touch_updated before update on public.expense_drafts for each row execute function private.touch_updated();
create function private.occurrence_date(anchor date,frequency text,idx int) returns date language sql immutable set search_path='' as $$
 select case frequency when 'WEEKLY' then anchor+idx*7 when 'MONTHLY' then (anchor+make_interval(months=>idx))::date when 'YEARLY' then (anchor+make_interval(years=>idx))::date end $$;
create function private.can_manage_schedule(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.expense_schedules x join public.groups g on g.id=x.group_id where x.id=s and (x.creator_id=auth.uid() or g.owner_id=auth.uid()) and private.is_member(g.id)) $$;
create function public.manage_expense_schedule(p_input jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.expense_schedules;t public.split_templates;v uuid=coalesce(p_id,gen_random_uuid());tz text;f text;start_at date;end_at date;state text;next_idx int=0;local_today date;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into s from public.expense_schedules where id=p_id;
 if not private.can_manage_schedule(p_id) then raise exception 'Only schedule creator or group owner can manage schedule' using errcode='42501';end if;
 if s.status='ARCHIVED' then raise exception 'Archived schedules cannot be changed';end if;
 if p_input ? 'templateId' and (p_input->>'templateId')::uuid<>s.template_id then raise exception 'Create a new schedule to change its template';end if;
 end if;
 select * into t from public.split_templates where id=coalesce((p_input->>'templateId')::uuid,s.template_id);
 if not found or not private.is_member(t.group_id) or (t.archived_at is not null and coalesce(p_input->>'status',s.status,'ACTIVE')='ACTIVE') then raise exception 'Active group template required';end if;
 tz=coalesce(p_input->>'timezone',s.timezone); f=coalesce(p_input->>'frequency',s.frequency);start_at=coalesce((p_input->>'startDate')::date,s.start_date);
 end_at=case when p_input ? 'endDate' then (p_input->>'endDate')::date else s.end_date end;
 state=coalesce(p_input->>'status',s.status,'ACTIVE');
 if tz is null or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Invalid IANA timezone';end if;
 if f is null or f not in ('WEEKLY','MONTHLY','YEARLY') or start_at is null or (end_at is not null and end_at<start_at) or state not in ('ACTIVE','PAUSED','ARCHIVED') then raise exception 'Invalid recurrence settings';end if;
 -- Cadence is immutable after creation, preserving occurrence identities and snapshots.
 if p_id is not null and (f<>s.frequency or tz<>s.timezone or start_at<>s.start_date) then raise exception 'Create a new schedule to change cadence or timezone';end if;
 if state='ACTIVE' then perform private.validate_template(t.group_id,t.payload,true);end if;
 local_today=(now() at time zone tz)::date;
 if p_id is null and start_at<local_today then raise exception 'Start date must be today or later';end if;
 next_idx=coalesce(s.next_index,0);
 if s.status='PAUSED' and state='ACTIVE' then
 while private.occurrence_date(start_at,f,next_idx)<local_today loop next_idx=next_idx+1;end loop;
 end if;
 if p_id is null then insert into public.expense_schedules(id,group_id,template_id,creator_id,frequency,start_date,end_date,timezone,status,next_index) values(v,t.group_id,t.id,auth.uid(),f,start_at,end_at,tz,state,next_idx);
 else update public.expense_schedules set end_date=end_at,status=state,next_index=next_idx where id=v;end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('ExpenseSchedule',v,auth.uid(),case when p_id is null then 'CREATE' else state end,jsonb_build_object('status',state));
 return (select to_jsonb(x) from public.expense_schedules x where id=v);
end $$;
-- Cron has no user session. This private function only snapshots drafts; it cannot post accounting.
create function private.generate_expense_drafts(p_now timestamptz default now()) returns int language plpgsql security definer set search_path='' as $$
declare s record;due date;today date;idx int;count_new int=0;inserted int;batch_count int;
begin
 perform pg_advisory_xact_lock(821141009);
 for s in select x.*,t.payload,t.archived_at from public.expense_schedules x join public.split_templates t on t.id=x.template_id where x.status='ACTIVE' order by x.created_at loop
 if s.archived_at is not null then update public.expense_schedules set status='PAUSED' where id=s.id;continue;end if;
 today=(p_now at time zone s.timezone)::date;idx=s.next_index;batch_count=0;
 loop
 due=private.occurrence_date(s.start_date,s.frequency,idx);
 exit when due>today or (s.end_date is not null and due>s.end_date) or batch_count>=100;
 insert into public.expense_drafts(schedule_id,group_id,due_date,timezone,payload) values(s.id,s.group_id,due,s.timezone,s.payload) on conflict(schedule_id,due_date) do nothing;
 get diagnostics inserted=row_count;count_new=count_new+inserted;
 if inserted>0 then insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('ExpenseSchedule',s.id,s.creator_id,'GENERATE_DRAFT',jsonb_build_object('system',true,'dueDate',due));end if;
 idx=idx+1;batch_count=batch_count+1;
 end loop;
 update public.expense_schedules set next_index=idx where id=s.id;
 end loop;
 return count_new;
end $$;
create function private.complete_draft_valid(g uuid,p jsonb) returns boolean language plpgsql stable set search_path='' as $$
begin perform private.validate_template(g,p,true);return true;exception when others then return false;end $$;
create function public.list_expense_drafts(p_group_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (p_group_id is not null and not private.is_member(p_group_id)) then raise exception 'Unauthorized' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('canManage',private.can_manage_schedule(d.schedule_id),'needsCorrection',not private.complete_draft_valid(d.group_id,d.payload),'scheduleStatus',s.status) order by d.due_date),'[]') from public.expense_drafts d join public.expense_schedules s on s.id=d.schedule_id where d.status='DRAFT' and private.is_member(d.group_id) and (case when p_group_id is null then private.can_manage_schedule(d.schedule_id) else d.group_id=p_group_id end));
end $$;
create function public.mutate_expense_draft(p_id uuid,p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.expense_drafts;v jsonb;expense jsonb;expense_uuid uuid;
begin
 perform private.lock_ledger();select * into d from public.expense_drafts where id=p_id for update;
 if not found then raise exception 'Draft not found' using errcode='P0002';end if;
 if not private.can_manage_schedule(d.schedule_id) then raise exception 'Only schedule creator or group owner can review draft' using errcode='42501';end if;
 if d.status='POSTED' and p_action='POST' then
 if d.expense_id is null then raise exception 'Posted expense was deleted; this occurrence cannot be reposted';end if;
 return (select to_jsonb(e) from public.split_expenses e where id=d.expense_id);
 end if;
 if d.status<>'DRAFT' then raise exception 'Draft is no longer pending';end if;
 if p_action='SKIP' then update public.expense_drafts set status='SKIPPED' where id=p_id;
 elsif p_action in ('UPDATE','POST') then
 v=case when p_input='{}'::jsonb then d.payload else p_input end;
 if p_action='UPDATE' then
 v=private.validate_template(d.group_id,v,true);update public.expense_drafts set payload=v where id=p_id;
 else
 -- Posting accepts account/category selections but never stores them in the reusable payload.
 perform private.validate_template(d.group_id,(v-'categoryId'-'date'-'groupId')||jsonb_build_object('payers',(select jsonb_agg(x-'accountId') from jsonb_array_elements(v->'payers') x)),true);
 v=v||jsonb_build_object('groupId',d.group_id,'date',(d.due_date::timestamp at time zone d.timezone));
 expense=public.create_split_expense_atomic(v);expense_uuid=(expense->>'id')::uuid;
 update public.expense_drafts set status='POSTED',expense_id=expense_uuid,posted_by=auth.uid() where id=p_id;
 end if;
 else raise exception 'Invalid draft action';end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('ExpenseDraft',p_id,auth.uid(),p_action);
 return coalesce(expense,(select to_jsonb(x) from public.expense_drafts x where id=p_id));
end $$;
-- Removal checks share the same advisory lock as all membership and ledger operations.
-- Cascade group deletion must not be blocked by schedules that disappear with the group.
-- Trigger sees the parent already deleted during cascades; guard only existing parents.
create function private.guard_recurring_member_removal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(821141009);
 if exists(select 1 from public.groups where id=old.group_id) and exists(select 1 from public.expense_schedules where group_id=old.group_id and creator_id=old.user_id and status<>'ARCHIVED') then raise exception 'Archive this member’s schedules before removal';end if;
 return old;
end $$;
create trigger recurring_member_removal before delete on public.group_members for each row execute function private.guard_recurring_member_removal();
alter table public.expense_schedules enable row level security;
alter table public.expense_drafts enable row level security;
revoke all on public.expense_schedules,public.expense_drafts from anon,authenticated;
grant select on public.expense_schedules,public.expense_drafts to authenticated;
create policy member_schedules on public.expense_schedules for select to authenticated using(private.is_member(group_id));
create policy member_drafts on public.expense_drafts for select to authenticated using(private.is_member(group_id));
revoke all on function private.complete_draft_valid(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.occurrence_date(date,text,int),private.can_manage_schedule(uuid),private.generate_expense_drafts(timestamptz),private.guard_recurring_member_removal() from public,anon,authenticated;
revoke all on function public.manage_expense_schedule(jsonb,uuid),public.list_expense_drafts(uuid),public.mutate_expense_draft(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_expense_schedule(jsonb,uuid),public.list_expense_drafts(uuid),public.mutate_expense_draft(uuid,text,jsonb) to authenticated;
create extension if not exists pg_cron;
select cron.schedule('generate-expense-drafts-hourly','0 * * * *','select private.generate_expense_drafts();');
