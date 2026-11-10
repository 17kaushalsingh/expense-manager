-- Read reports use the caller's timezone and aggregate in SQL, without API row caps.
create function public.group_financial_summary(p_group_id uuid, p_month text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text; first_day date; lo timestamptz; hi timestamptz; result jsonb;
begin
 if auth.uid() is null or not private.is_member(p_group_id) then raise exception 'Group membership required' using errcode='42501'; end if;
 select timezone into tz from public.users where id=auth.uid();
 if p_month is not null then
  if p_month !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month'; end if;
  first_day=(p_month||'-01')::date;
  lo=first_day::timestamp at time zone tz;
  hi=(first_day+interval '1 month')::timestamp at time zone tz;
 end if;
 with expenses as (
  select * from public.split_expenses where group_id=p_group_id and (lo is null or date>=lo) and (hi is null or date<hi)
 ), payments as (
  select * from public.settlements where group_id=p_group_id and (lo is null or date>=lo) and (hi is null or date<hi)
 )
 select jsonb_build_object(
  'currency',(select currency from public.groups where id=p_group_id), 'timezone',tz,'month',p_month,
  'expenseCount',(select count(*) from expenses),
  'totalSpending',coalesce((select sum(total_amount) from expenses),0),
  'youPaid',coalesce((select sum(p.amount_paid) from public.split_payers p join expenses e on e.id=p.split_expense_id where p.user_id=auth.uid()),0),
  'yourShare',coalesce((select sum(p.amount_owed) from public.split_participants p join expenses e on e.id=p.split_expense_id where p.user_id=auth.uid()),0),
  'paymentsSent',coalesce((select sum(amount) from payments where payer_id=auth.uid()),0),
  'paymentsReceived',coalesce((select sum(amount) from payments where payee_id=auth.uid()),0)
 ) into result;
 return result||jsonb_build_object('netChange',(result->>'youPaid')::numeric-(result->>'yourShare')::numeric+(result->>'paymentsSent')::numeric-(result->>'paymentsReceived')::numeric);
end $$;

-- A default is an allocation preference, not a pre-created expense or a private account.
create table public.group_split_defaults (
 group_id uuid primary key references public.groups on delete cascade,
 template_id uuid not null references public.split_templates on delete cascade,
 updated_by uuid not null references public.users,
 updated_at timestamptz not null default now()
);
create index group_defaults_template on public.group_split_defaults(template_id);
create index group_defaults_actor on public.group_split_defaults(updated_by);
alter table public.group_split_defaults enable row level security;
revoke all on public.group_split_defaults from public,anon,authenticated;
grant select on public.group_split_defaults to authenticated;
create policy member_read_default on public.group_split_defaults for select to authenticated using(private.is_member(group_id));
create function public.group_split_default(p_group_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.split_templates;
begin
 if auth.uid() is null or not private.is_member(p_group_id) then raise exception 'Group membership required' using errcode='42501'; end if;
 select s.* into t from public.split_templates s join public.group_split_defaults d on d.template_id=s.id where d.group_id=p_group_id;
 if t.id is null or t.archived_at is not null then return null; end if;
 return jsonb_build_object('id',t.id,'name',t.name,'payload',t.payload,'needsCorrection',not private.template_valid(p_group_id,t.payload));
end $$;
create function public.set_group_split_default(p_group_id uuid,p_template_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.split_templates;
begin
 perform private.lock_ledger();
 if not exists(select 1 from public.groups where id=p_group_id and owner_id=auth.uid()) then raise exception 'Only the group owner can change the default' using errcode='42501'; end if;
 if p_template_id is null then delete from public.group_split_defaults where group_id=p_group_id;
 else
  select * into t from public.split_templates where id=p_template_id and group_id=p_group_id and archived_at is null;
  if t.id is null or not private.template_valid(p_group_id,t.payload) then raise exception 'Choose a valid active template from this group'; end if;
  insert into public.group_split_defaults(group_id,template_id,updated_by) values(p_group_id,p_template_id,auth.uid()) on conflict(group_id) do update set template_id=excluded.template_id,updated_by=excluded.updated_by,updated_at=now();
 end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('Group',p_group_id,auth.uid(),'DEFAULT_SPLIT',jsonb_build_object('templateId',p_template_id));
 return public.group_split_default(p_group_id);
end $$;

-- Reversing a record never cancels a payment at a bank or payment provider.
-- This immutable tombstone makes repeated/concurrent reversals idempotent.
create table public.settlement_reversals (
 settlement_id uuid primary key,
 payer_id uuid not null references public.users,
 payee_id uuid not null references public.users,
 group_id uuid references public.groups on delete set null,
 currency text not null,
 amount numeric(14,2) not null check(amount>0),
 payment_date timestamptz not null,
 reversed_by uuid not null references public.users,
 reversed_at timestamptz not null default now()
);
create index reversal_payer on public.settlement_reversals(payer_id);
create index reversal_payee on public.settlement_reversals(payee_id);
create index reversal_group on public.settlement_reversals(group_id);
create index reversal_actor on public.settlement_reversals(reversed_by);
alter table public.settlement_reversals enable row level security;
revoke all on public.settlement_reversals from public,anon,authenticated;
grant select on public.settlement_reversals to authenticated;
create policy readable_reversals on public.settlement_reversals for select to authenticated using(payer_id=auth.uid() or payee_id=auth.uid() or private.is_member(group_id));
create function public.reverse_settlement_atomic(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.settlements; prior public.settlement_reversals; r record;
begin
 perform private.lock_ledger();
 select * into prior from public.settlement_reversals where settlement_id=p_id;
 if prior.settlement_id is not null then
  if auth.uid() not in (prior.payer_id,prior.payee_id) and not exists(select 1 from public.groups where id=prior.group_id and owner_id=auth.uid()) then raise exception 'Settlement permission required' using errcode='42501'; end if;
  return to_jsonb(prior);
 end if;
 select * into s from public.settlements where id=p_id;
 if s.id is null then raise exception 'Settlement not found' using errcode='P0002'; end if;
 if auth.uid() not in (s.payer_id,s.payee_id) and not exists(select 1 from public.groups where id=s.group_id and owner_id=auth.uid()) then raise exception 'Only a payment party or group owner can reverse it' using errcode='42501'; end if;
 for r in select account_id,sum(balance_delta) delta from public.transactions where source_type='SETTLEMENT' and source_id=p_id group by account_id order by account_id loop
  update public.accounts set balance=balance-r.delta where id=r.account_id;
 end loop;
 delete from public.transactions where source_type='SETTLEMENT' and source_id=p_id;
 delete from public.settlements where id=p_id;
 perform private.reconcile_virtual(s.payer_id,s.currency,'SETTLEMENT',p_id,now());
 perform private.reconcile_virtual(s.payee_id,s.currency,'SETTLEMENT',p_id,now());
 insert into public.settlement_reversals(settlement_id,payer_id,payee_id,group_id,currency,amount,payment_date,reversed_by) values(s.id,s.payer_id,s.payee_id,s.group_id,s.currency,s.amount,s.date,auth.uid()) returning * into prior;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('Settlement',p_id,auth.uid(),'REVERSE',jsonb_build_object('amount',s.amount,'currency',s.currency,'groupId',s.group_id));
 return to_jsonb(prior);
end $$;
revoke all on function public.group_financial_summary(uuid,text),public.group_split_default(uuid),public.set_group_split_default(uuid,uuid),public.reverse_settlement_atomic(uuid) from public,anon;
grant execute on function public.group_financial_summary(uuid,text),public.group_split_default(uuid),public.set_group_split_default(uuid,uuid),public.reverse_settlement_atomic(uuid) to authenticated;
