alter table public.transactions drop constraint transactions_source_type_check;
alter table public.transactions add constraint transactions_source_type_check check(source_type in ('MANUAL','TRANSFER','SPLIT','SETTLEMENT','PERSONAL_LOAN'));
create table public.personal_loans (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 name text not null check(length(trim(name)) between 1 and 120),counterparty text not null check(length(trim(counterparty)) between 1 and 120),
 direction text not null check(direction in ('LENT','BORROWED')),principal numeric(14,2) not null check(principal>0),currency text not null,
 start_date date not null,first_due_date date,frequency text not null default 'MONTHLY' check(frequency in ('WEEKLY','MONTHLY')),
 installment_count int not null default 1 check(installment_count between 1 and 600),
 notes text not null default '' check(length(notes)<=2000),archived boolean not null default false,
 disbursed boolean not null default false,request_key uuid not null,unique(user_id,request_key),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.loan_payments (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 loan_id uuid not null references public.personal_loans,principal numeric(14,2) not null check(principal>=0),interest numeric(14,2) not null check(interest>=0),
 account_id uuid not null references public.accounts,date_time timestamptz not null,notes text not null default '' check(length(notes)<=2000),
 request_key uuid not null,unique(user_id,request_key),reversed_at timestamptz,created_at timestamptz not null default now(),check(principal+interest>0)
);
create index personal_loans_owner on public.personal_loans(user_id);
create index loan_payments_owner on public.loan_payments(user_id);
create index loan_payments_loan on public.loan_payments(loan_id);
create index loan_payments_account on public.loan_payments(account_id);
alter table public.personal_loans enable row level security;
alter table public.loan_payments enable row level security;
revoke all on public.personal_loans,public.loan_payments from public,anon,authenticated;
grant select on public.personal_loans,public.loan_payments to authenticated;
create policy own_loans on public.personal_loans for select to authenticated using(user_id=(select auth.uid()));
create policy own_payments on public.loan_payments for select to authenticated using(user_id=(select auth.uid()));
create trigger touch_updated before update on public.personal_loans for each row execute function private.touch_updated();
create trigger audit_personal after insert or update or delete on public.personal_loans for each row execute function private.audit_personal_record();
create trigger audit_personal after insert or update or delete on public.loan_payments for each row execute function private.audit_personal_record();
create function public.manage_personal_loan(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.personal_loans;v uuid;cash public.accounts;c text;n numeric;paid numeric;dt timestamptz;
begin
 perform private.lock_ledger();
 select display_currency into c from public.users where id=auth.uid();
 if p_id is not null then
 select * into l from public.personal_loans where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Loan not found' using errcode='P0002';end if;
 select coalesce(sum(principal) filter(where reversed_at is null),0) into paid from public.loan_payments where loan_id=l.id;
 if p_delete then
 if l.disbursed or exists(select 1 from public.loan_payments where loan_id=l.id) then raise exception 'Loans with cash history can only be archived after repayment';end if;
 delete from public.personal_loans where id=l.id;return '{}'::jsonb;
 end if;
 if coalesce((p_input->>'archived')::boolean,false) and l.principal<>paid then raise exception 'Repay the outstanding principal before archiving';end if;
 update public.personal_loans set name=trim(p_input->>'name'),counterparty=trim(p_input->>'counterparty'),first_due_date=(p_input->>'firstDueDate')::date,frequency=p_input->>'frequency',installment_count=(p_input->>'installmentCount')::int,notes=coalesce(p_input->>'notes',''),archived=coalesce((p_input->>'archived')::boolean,false) where id=l.id returning * into l;
 return to_jsonb(l);
 end if;
 select * into l from public.personal_loans where user_id=auth.uid() and request_key=(p_input->>'requestKey')::uuid;
 if found then return to_jsonb(l);end if;
 n=(p_input->>'principal')::numeric;
 if not private.valid_money(n) then raise exception 'Invalid principal';end if;
 if p_input->>'currency' is distinct from c then raise exception 'Currency must match your profile';end if;
 if p_input->>'accountId' is not null then
 select * into cash from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid() and currency=c and type in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT');
 if not found then raise exception 'Choose an owned cash or asset account';end if;
 end if;
 insert into public.personal_loans(user_id,name,counterparty,direction,principal,currency,start_date,first_due_date,frequency,installment_count,notes,disbursed,request_key)
 values(auth.uid(),trim(p_input->>'name'),trim(p_input->>'counterparty'),p_input->>'direction',n,c,(p_input->>'startDate')::date,(p_input->>'firstDueDate')::date,p_input->>'frequency',(p_input->>'installmentCount')::int,coalesce(p_input->>'notes',''),cash.id is not null,(p_input->>'requestKey')::uuid) returning * into l;
 if cash.id is not null then
 select l.start_date::timestamp at time zone timezone into dt from public.users where id=auth.uid();
 perform private.entry(auth.uid(),cash.id,'TRANSFER',n,case l.direction when 'LENT' then -n else n end,0,'PERSONAL_LOAN',l.id,dt,'Loan principal: '||l.name);
 end if;
 return to_jsonb(l);
end $$;
create function public.record_loan_payment(p_loan_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.personal_loans;p public.loan_payments;a public.accounts;n numeric;i numeric;owed numeric;direction int;
begin
 perform private.lock_ledger();
 select * into l from public.personal_loans where id=p_loan_id and user_id=auth.uid();
 if not found then raise exception 'Loan not found' using errcode='P0002';end if;
 select * into p from public.loan_payments where user_id=auth.uid() and request_key=(p_input->>'requestKey')::uuid;
 if found then
 if p.loan_id<>l.id then raise exception 'This request key belongs to another loan';end if;return to_jsonb(p);
 end if;
 if l.archived then raise exception 'Unarchive the loan before recording payments';end if;
 n=(p_input->>'principal')::numeric;i=(p_input->>'interest')::numeric;
 if n is null or i is null or n<0 or i<0 or n<>round(n,2) or i<>round(i,2) or not private.valid_money(n+i) then raise exception 'Invalid principal or interest';end if;
 select l.principal-coalesce(sum(principal) filter(where reversed_at is null),0) into owed from public.loan_payments where loan_id=l.id;
 if n>owed then raise exception 'Principal payment exceeds outstanding debt';end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid() and currency=l.currency and type in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT');
 if not found then raise exception 'Choose an owned cash or asset account';end if;
 insert into public.loan_payments(user_id,loan_id,principal,interest,account_id,date_time,notes,request_key) values(auth.uid(),l.id,n,i,a.id,(p_input->>'dateTime')::timestamptz,coalesce(p_input->>'notes',''),(p_input->>'requestKey')::uuid) returning * into p;
 direction=case l.direction when 'LENT' then 1 else -1 end;
 if n>0 then perform private.entry(auth.uid(),a.id,'TRANSFER',n,n*direction,0,'PERSONAL_LOAN',p.id,p.date_time,'Loan repayment: '||l.name);end if;
 if i>0 then perform private.entry(auth.uid(),a.id,case l.direction when 'LENT' then 'INCOME' else 'EXPENSE' end,i,i*direction,i,'PERSONAL_LOAN',p.id,p.date_time,'Loan interest: '||l.name);end if;
 return to_jsonb(p);
end $$;
create function public.reverse_loan_payment(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.loan_payments;r record;
begin
 perform private.lock_ledger();
 select * into p from public.loan_payments where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Payment not found' using errcode='P0002';end if;
 if p.reversed_at is not null then return to_jsonb(p);end if;
 for r in select account_id,sum(balance_delta) d from public.transactions where source_type='PERSONAL_LOAN' and source_id=p.id and user_id=auth.uid() group by account_id loop
 update public.accounts set balance=balance-r.d where id=r.account_id and user_id=auth.uid();if not found then raise exception 'Original account missing';end if;
 end loop;
 delete from public.transactions where source_type='PERSONAL_LOAN' and source_id=p.id and user_id=auth.uid();
 update public.loan_payments set reversed_at=now() where id=p.id returning * into p;
 update public.personal_loans set archived=false where id=p.loan_id;
 return to_jsonb(p);
end $$;
create function public.personal_loan_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('repaid',coalesce((select sum(principal) from public.loan_payments where loan_id=l.id and reversed_at is null),0),'interest_total',coalesce((select sum(interest) from public.loan_payments where loan_id=l.id and reversed_at is null),0)) order by l.created_at desc,l.id),'[]') from public.personal_loans l where user_id=auth.uid()
$$;
create function private.guard_loan_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.display_currency<>old.display_currency and exists(select 1 from public.personal_loans where user_id=old.id) then raise exception 'Remove private loans before changing currency';end if;return new;
end $$;
create trigger loan_currency before update on public.users for each row execute function private.guard_loan_currency();
revoke all on function private.guard_loan_currency() from public,anon,authenticated;
revoke all on function public.manage_personal_loan(jsonb,uuid,boolean),public.record_loan_payment(uuid,jsonb),public.reverse_loan_payment(uuid),public.personal_loan_summary() from public,anon;
grant execute on function public.manage_personal_loan(jsonb,uuid,boolean),public.record_loan_payment(uuid,jsonb),public.reverse_loan_payment(uuid),public.personal_loan_summary() to authenticated;
