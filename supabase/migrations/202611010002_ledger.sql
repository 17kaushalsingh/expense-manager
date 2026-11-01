-- Accounting writes are serialized to make read/validate/write operations safe across
-- users, settlements, reversals and concurrent requests. All locks live until commit.
create function private.lock_ledger() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(821141009);
end $$;
create function private.valid_money(n numeric) returns boolean language sql immutable as $$
 select n is not null and n>0 and n<1000000000000 and n=round(n,2) $$;
create function private.default_account(u uuid,t text,c text) returns uuid language plpgsql set search_path='' as $$
declare a uuid;
begin
 select id into a from public.accounts where user_id=u and type=t and currency=c and is_default;
 if a is null then
 insert into public.accounts(user_id,name,type,currency,is_default) values(u,case t when 'ACCOUNTS_RECEIVABLE' then 'Receivables' when 'ACCOUNTS_PAYABLE' then 'Payables' else 'Cash' end,t,c,true) returning id into a;
 end if;
 return a;
end $$;
create function private.entry(u uuid,a uuid,t text,n numeric,d numeric,analytics numeric,src text,s uuid,dt timestamptz,note text,cat uuid default null) returns uuid language plpgsql set search_path='' as $$
declare tx uuid;
begin
 insert into public.transactions(user_id,account_id,type,amount,balance_delta,analytics_amount,source_type,source_id,date_time,notes,category_id)
 values(u,a,t,n,d,analytics,src,s,dt,note,cat) returning id into tx;
 update public.accounts set balance=balance+d where id=a and user_id=u;
 if not found then raise exception 'Account not found'; end if;
 return tx;
end $$;
create function private.check_category(cat uuid,u uuid,t text) returns void language plpgsql set search_path='' as $$
begin
 if cat is not null and not exists(select 1 from public.categories where id=cat and (user_id is null or user_id=u) and type=t) then
 raise exception 'Category not found or incompatible'; end if;
end $$;
create function public.mutate_transaction_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.transactions; a public.accounts; n numeric; t text; d numeric; tx uuid; cat uuid;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into old from public.transactions where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Transaction not found' using errcode='P0002'; end if;
 if old.source_type<>'MANUAL' then raise exception 'Generated entries must be changed through their source'; end if;
 update public.accounts set balance=balance-old.balance_delta where id=old.account_id;
 delete from public.transactions where id=p_id;
 end if;
 if p_delete then return '{}'::jsonb; end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid();
 if not found or a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then raise exception 'Account not found or reserved'; end if;
 n=(p_input->>'amount')::numeric; t=p_input->>'type'; cat=(p_input->>'categoryId')::uuid;
 if not private.valid_money(n) or t not in ('INCOME','EXPENSE') then raise exception 'Invalid manual transaction'; end if;
 perform private.check_category(cat,auth.uid(),t);
 d=case when (t='INCOME') <> (a.type in ('CREDIT_CARD','LOAN')) then n else -n end;
 tx=private.entry(auth.uid(),a.id,t,n,d,n,'MANUAL',null,(p_input->>'dateTime')::timestamptz,p_input->>'notes',cat);
 if p_id is not null then update public.transactions set id=p_id where id=tx; tx=p_id; end if;
 update public.transactions set tags=p_input->'tags', attachments=p_input->'attachments' where id=tx;
 return (select to_jsonb(x) from public.transactions x where id=tx);
end $$;
create function public.transfer_accounts_atomic(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.accounts; b public.accounts; n numeric; src uuid=gen_random_uuid(); x uuid; y uuid; dt timestamptz;
begin
 perform private.lock_ledger();
 select * into a from public.accounts where id=(p_input->>'sourceAccountId')::uuid and user_id=auth.uid();
 select * into b from public.accounts where id=(p_input->>'targetAccountId')::uuid and user_id=auth.uid();
 if a.id is null or b.id is null or a.id=b.id then raise exception 'Choose two owned accounts'; end if;
 if a.currency<>b.currency or a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') or b.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then raise exception 'Incompatible transfer accounts'; end if;
 n=(p_input->>'amount')::numeric; dt=(p_input->>'dateTime')::timestamptz;
 if not private.valid_money(n) then raise exception 'Invalid amount'; end if;
 x=private.entry(auth.uid(),a.id,'TRANSFER',n,case when a.type in ('CREDIT_CARD','LOAN') then n else -n end,0,'TRANSFER',src,dt,p_input->>'notes');
 y=private.entry(auth.uid(),b.id,'TRANSFER',n,case when b.type in ('CREDIT_CARD','LOAN') then -n else n end,0,'TRANSFER',src,dt,p_input->>'notes');
 update public.transactions set linked_transaction_id=x where id=y;
 return jsonb_build_object('id',src,'message','Transfer successful');
end $$;
create function private.reverse_split(s uuid) returns void language plpgsql set search_path='' as $$
declare r record;
begin
 for r in select account_id,sum(balance_delta) delta from public.transactions where source_type='SPLIT' and source_id=s group by account_id loop
 update public.accounts set balance=balance-r.delta where id=r.account_id;
 end loop;
 delete from public.transactions where source_type='SPLIT' and source_id=s;
 delete from public.split_payers where split_expense_id=s;
 delete from public.split_participants where split_expense_id=s;
end $$;
create function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s uuid=coalesce(p_id,gen_random_uuid()); g uuid=(p_input->>'groupId')::uuid; c text; creator uuid=auth.uid();
 old public.split_expenses; n numeric; kind text; dt timestamptz; cat uuid; description text;
 party jsonb; uid uuid; a uuid; paid numeric; owed numeric; share numeric; sum_paid numeric=0; sum_shares numeric=0;
 count_part integer; idx integer=0; allocated numeric=0; cents numeric; remainder integer;
 before_state jsonb;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into old from public.split_expenses where id=p_id;
 if not found then raise exception 'Split not found' using errcode='P0002'; end if;
 if old.creator_id<>auth.uid() and not exists(select 1 from public.groups where id=old.group_id and owner_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.settlements where group_id is not distinct from old.group_id) then raise exception 'Cannot change expenses after settlement'; end if;
 before_state=to_jsonb(old); creator=old.creator_id;
 perform private.reverse_split(s);
 if p_delete then
 delete from public.split_expenses where id=s;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),'DELETE',before_state);
 return '{}'::jsonb;
 end if;
 if g is distinct from old.group_id then raise exception 'Cannot move an expense to another group'; end if;
 end if;
 if g is not null then
 if not private.is_member(g) then raise exception 'Group not found' using errcode='42501'; end if;
 select currency into c from public.groups where id=g;
 else select display_currency into c from public.users where id=auth.uid(); end if;
 n=(p_input->>'totalAmount')::numeric; kind=p_input->>'splitType'; dt=coalesce((p_input->>'date')::timestamptz,now());
 description=trim(p_input->>'description'); cat=(p_input->>'categoryId')::uuid;
 if not private.valid_money(n) or length(description)=0 or description is null or kind not in ('EQUAL','EXACT','PERCENTAGE','SHARES') then raise exception 'Invalid expense'; end if;
 perform private.check_category(cat,auth.uid(),'EXPENSE');
 count_part=jsonb_array_length(p_input->'participants');
 if count_part is null or count_part<1 or coalesce(jsonb_array_length(p_input->'payers'),0)<1 then raise exception 'Payers and participants are required'; end if;
 if exists(select 1 from jsonb_array_elements(p_input->'payers') p group by p->>'userId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_input->'participants') p group by p->>'userId' having count(*)>1) then raise exception 'Duplicate parties'; end if;
 if not exists(select 1 from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) p where p->>'userId'=creator::text) then raise exception 'Creator must be involved'; end if;
 for party in select value from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) loop
 uid=(party->>'userId')::uuid;
 if not exists(select 1 from public.users where id=uid and display_currency=c) then raise exception 'All parties must use the same currency'; end if;
 if g is not null and not exists(select 1 from public.group_members where group_id=g and user_id=uid) then raise exception 'Party is not a group member'; end if;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 paid=(party->>'amountPaid')::numeric;
 if not private.valid_money(paid) then raise exception 'Invalid payer amount'; end if;
 sum_paid=sum_paid+paid;
 end loop;
 if sum_paid<>n then raise exception 'Payments must equal total'; end if;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 if share is null or share<0 or share<>round(share,4) then raise exception 'Invalid share'; end if;
 if kind='EXACT' and share<>round(share,2) then raise exception 'Exact shares must be cents'; end if;
 sum_shares=sum_shares+share;
 end loop;
 if (kind='EXACT' and sum_shares<>n) or (kind='PERCENTAGE' and sum_shares<>100) or sum_shares<=0 then raise exception 'Invalid share total'; end if;
 if p_id is null then
 insert into public.split_expenses(id,group_id,creator_id,description,currency,total_amount,split_type,date,category_id) values(s,g,creator,description,c,n,kind,dt,cat);
 else update public.split_expenses set description=trim(p_input->>'description'),total_amount=n,split_type=kind,date=dt,category_id=cat where id=s; end if;
 -- Floor proportional allocations and distribute remaining cents by input order.
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 owed=case when kind='EXACT' then share else floor(n*100*share/sum_shares)/100 end;
 allocated=allocated+owed;
 insert into public.split_participants(split_expense_id,user_id,share_value,amount_owed) values(s,(party->>'userId')::uuid,share,owed);
 end loop;
 remainder=((n-allocated)*100)::integer;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 if idx<remainder then update public.split_participants set amount_owed=amount_owed+0.01 where split_expense_id=s and user_id=(party->>'userId')::uuid; end if;
 idx=idx+1;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 uid=(party->>'userId')::uuid; paid=(party->>'amountPaid')::numeric;
 if uid=auth.uid() and party->>'accountId' is not null then
 select id into a from public.accounts where id=(party->>'accountId')::uuid and user_id=uid and currency=c and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE');
 if a is null then raise exception 'Payer account not found'; end if;
 elsif party->>'accountId' is not null and uid<>auth.uid() then raise exception 'Cannot choose another user account';
 else a=private.default_account(uid,'CASH',c); end if;
 insert into public.split_payers(split_expense_id,user_id,amount_paid,account_id) values(s,uid,paid,a);
 perform private.entry(uid,a,'TRANSFER',paid,case when (select type from public.accounts where id=a) in ('CREDIT_CARD','LOAN') then paid else -paid end,0,'SPLIT',s,dt,'Payment: '||description);
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s loop
 select coalesce(sum(amount_paid),0) into paid from public.split_payers where split_expense_id=s and user_id=uid;
 select coalesce(sum(amount_owed),0) into owed from public.split_participants where split_expense_id=s and user_id=uid;
 -- One personal expense record, with no duplicate cash effect.
 if owed>0 then
 a=private.default_account(uid,'CASH',c);
 perform private.entry(uid,a,'EXPENSE',owed,0,owed,'SPLIT',s,dt,'Share: '||description,case when uid=auth.uid() then cat else null end);
 end if;
 if paid<>owed then
 a=private.default_account(uid,case when paid>owed then 'ACCOUNTS_RECEIVABLE' else 'ACCOUNTS_PAYABLE' end,c);
 perform private.entry(uid,a,'TRANSFER',abs(paid-owed),abs(paid-owed),0,'SPLIT',s,dt,description);
 end if;
 end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),case when p_id is null then 'CREATE' else 'UPDATE' end,jsonb_build_object('before',before_state,'after',p_input));
 return (select to_jsonb(e)||jsonb_build_object('payers',(select jsonb_agg(to_jsonb(p)) from public.split_payers p where split_expense_id=s),'participants',(select jsonb_agg(to_jsonb(p)) from public.split_participants p where split_expense_id=s)) from public.split_expenses e where id=s);
end $$;
-- Net balances after settlements, shared by API display and authoritative settlement validation.
create function private.context_balances(g uuid) returns table(user_id uuid, balance numeric) language sql stable security definer set search_path='' as $$
 select x.u,sum(x.n) from (
 select p.user_id u,p.amount_paid n from public.split_payers p join public.split_expenses e on e.id=p.split_expense_id where e.group_id is not distinct from g and (g is not null or private.can_read_split(e.id))
 union all select p.user_id,-p.amount_owed from public.split_participants p join public.split_expenses e on e.id=p.split_expense_id where e.group_id is not distinct from g and (g is not null or private.can_read_split(e.id))
 union all select s.payer_id,s.amount from public.settlements s where s.group_id is not distinct from g and (g is not null or s.payer_id=auth.uid() or s.payee_id=auth.uid())
 union all select s.payee_id,-s.amount from public.settlements s where s.group_id is not distinct from g and (g is not null or s.payer_id=auth.uid() or s.payee_id=auth.uid())
 ) x group by x.u $$;
create function public.simplify_debts(p_group_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare balances jsonb; work jsonb; edges jsonb='[]'; credit record; debt record; n numeric;
begin
 if auth.uid() is null or (p_group_id is not null and not private.is_member(p_group_id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_object_agg(user_id,balance),'{}') into balances from private.context_balances(p_group_id);
 work=balances;
 loop
 select key,value::numeric amount into credit from jsonb_each_text(work) where value::numeric>0 order by value::numeric desc,key limit 1;
 exit when not found;
 select key,value::numeric amount into debt from jsonb_each_text(work) where value::numeric<0 order by value::numeric,key desc limit 1;
 exit when not found;
 n=least(credit.amount,-debt.amount);
 edges=edges||jsonb_build_object('fromUserId',debt.key,'toUserId',credit.key,'amount',n);
 work=jsonb_set(jsonb_set(work,array[credit.key],to_jsonb(credit.amount-n)),array[debt.key],to_jsonb(debt.amount+n));
 end loop;
 return jsonb_build_object('groupBalances',balances,'simplifiedTransactions',edges);
end $$;
create function public.execute_settlement_atomic(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid=(p_input->>'groupId')::uuid; payee uuid=(p_input->>'payeeId')::uuid; a public.accounts; b uuid; n numeric; max_n numeric; c text; s uuid=gen_random_uuid(); dt timestamptz; x uuid; y uuid; r record;
begin
 perform private.lock_ledger();
 if payee=auth.uid() then raise exception 'Cannot settle with yourself'; end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid() and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE');
 if a.id is null then raise exception 'Account not found'; end if;
 c=a.currency; n=(p_input->>'amount')::numeric; dt=coalesce((p_input->>'date')::timestamptz,now());
 if not private.valid_money(n) then raise exception 'Invalid amount'; end if;
 if g is not null and not exists(select 1 from public.groups where id=g and currency=c) then raise exception 'Currency mismatch'; end if;
 select (e->>'amount')::numeric into max_n from jsonb_array_elements(public.simplify_debts(g)->'simplifiedTransactions') e where e->>'fromUserId'=auth.uid()::text and e->>'toUserId'=payee::text;
 if max_n is null or n>max_n then raise exception 'Payment exceeds current simplified debt'; end if;
 insert into public.settlements(id,payer_id,payee_id,group_id,currency,amount,account_id,method,date,notes) values(s,auth.uid(),payee,g,c,n,a.id,coalesce(p_input->>'method','CASH'),dt,p_input->>'notes');
 x=private.entry(auth.uid(),a.id,'TRANSFER',n,case when a.type in ('CREDIT_CARD','LOAN') then n else -n end,0,'SETTLEMENT',s,dt,p_input->>'notes');
 b=private.default_account(payee,'CASH',c);
 y=private.entry(payee,b,'TRANSFER',n,n,0,'SETTLEMENT',s,dt,p_input->>'notes');
 update public.transactions set linked_transaction_id=x where id=y;
 b=private.default_account(auth.uid(),'ACCOUNTS_PAYABLE',c);
 perform private.entry(auth.uid(),b,'TRANSFER',n,-n,0,'SETTLEMENT',s,dt,'Liability settled');
 b=private.default_account(payee,'ACCOUNTS_RECEIVABLE',c);
 perform private.entry(payee,b,'TRANSFER',n,-n,0,'SETTLEMENT',s,dt,'Receivable settled');
 return (select to_jsonb(v) from public.settlements v where id=s);
end $$;
-- Block invocation of internal functions; expose only authenticated, checked entrypoints.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid),private.can_read_split(uuid) to authenticated;
revoke all on function public.mutate_transaction_atomic(jsonb,uuid,boolean),public.transfer_accounts_atomic(jsonb),public.create_split_expense_atomic(jsonb,uuid,boolean),public.simplify_debts(uuid),public.execute_settlement_atomic(jsonb) from public,anon;
grant execute on function public.mutate_transaction_atomic(jsonb,uuid,boolean),public.transfer_accounts_atomic(jsonb),public.create_split_expense_atomic(jsonb,uuid,boolean),public.simplify_debts(uuid),public.execute_settlement_atomic(jsonb) to authenticated;
