create or replace function private.ad_hoc_graph(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; work jsonb; pairs jsonb='{}'; balances jsonb='{}'; edges jsonb='[]'; credit record; debt record; pair record; n numeric; other_id text; my_balance numeric=0;
begin
 for s in select id from public.split_expenses where group_id is null and (creator_id=p_actor or exists(select 1 from public.split_payers p where p.split_expense_id=public.split_expenses.id and p.user_id=p_actor) or exists(select 1 from public.split_participants p where p.split_expense_id=public.split_expenses.id and p.user_id=p_actor)) loop
 select jsonb_object_agg(q.u,q.n) into work from (
 select v.u,sum(v.n) n from (
 select user_id u,amount_paid n from public.split_payers where split_expense_id=s.id
 union all select user_id,-amount_owed from public.split_participants where split_expense_id=s.id
 ) v group by v.u) q;
 loop
 select key,value::numeric amount into credit from jsonb_each_text(work) where value::numeric>0 order by value::numeric desc,key limit 1; exit when not found;
 select key,value::numeric amount into debt from jsonb_each_text(work) where value::numeric<0 order by value::numeric,key desc limit 1; exit when not found;
 n=least(credit.amount,-debt.amount);
 if debt.key=p_actor::text or credit.key=p_actor::text then
 other_id=case when debt.key=p_actor::text then credit.key else debt.key end;
 pairs=jsonb_set(pairs,array[other_id],to_jsonb(coalesce((pairs->>other_id)::numeric,0)+case when debt.key=p_actor::text then n else -n end));
 end if;
 work=jsonb_set(jsonb_set(work,array[credit.key],to_jsonb(credit.amount-n)),array[debt.key],to_jsonb(debt.amount+n));
 end loop;
 end loop;
 for s in select * from public.settlements where group_id is null and (payer_id=p_actor or payee_id=p_actor) loop
 other_id=case when s.payer_id=p_actor then s.payee_id::text else s.payer_id::text end;
 pairs=jsonb_set(pairs,array[other_id],to_jsonb(coalesce((pairs->>other_id)::numeric,0)+case when s.payer_id=p_actor then -s.amount else s.amount end));
 end loop;
 for pair in select key,value::numeric amount from jsonb_each_text(pairs) order by key loop
 my_balance=my_balance-pair.amount;
 balances=jsonb_set(balances,array[pair.key],to_jsonb(pair.amount));
 if pair.amount<>0 then edges=edges||jsonb_build_object('fromUserId',case when pair.amount>0 then p_actor::text else pair.key end,'toUserId',case when pair.amount>0 then pair.key else p_actor::text end,'amount',abs(pair.amount));end if;
 end loop;
 balances=jsonb_set(balances,array[p_actor::text],to_jsonb(my_balance));
 return jsonb_build_object('groupBalances',balances,'simplifiedTransactions',edges);
end $$;

create or replace function private.ad_hoc_graph() returns jsonb language sql stable security definer set search_path='' as $$ select private.ad_hoc_graph(auth.uid()) $$;
-- AR/AP represent remaining net obligations per group and per ad-hoc counterpart.
-- Record reconciliation deltas as source-linked entries for auditable reversals.
create function private.reconcile_virtual(u uuid,c text,src text,s uuid,dt timestamptz) returns void language plpgsql set search_path='' as $$
declare ar numeric=0; ap numeric=0; a uuid; current_balance numeric; pair record; my_net numeric;
begin
 select coalesce(sum(greatest(net,0)),0),coalesce(sum(greatest(-net,0)),0) into ar,ap from (
 select g,sum(n) net from (
 select e.group_id g,p.amount_paid n from public.split_payers p join public.split_expenses e on e.id=p.split_expense_id where p.user_id=u and e.group_id is not null and e.currency=c
 union all select e.group_id,-p.amount_owed from public.split_participants p join public.split_expenses e on e.id=p.split_expense_id where p.user_id=u and e.group_id is not null and e.currency=c
 union all select group_id,amount from public.settlements where payer_id=u and group_id is not null and currency=c
 union all select group_id,-amount from public.settlements where payee_id=u and group_id is not null and currency=c
 ) q group by g) balances;
 for pair in select key,value::numeric amount from jsonb_each_text(private.ad_hoc_graph(u)->'groupBalances') where key<>u::text loop
 if pair.amount>0 then ap=ap+pair.amount;else ar=ar-pair.amount;end if;
 end loop;
 a=private.default_account(u,'ACCOUNTS_RECEIVABLE',c);
 select balance into current_balance from public.accounts where id=a;
 if ar<>current_balance then perform private.entry(u,a,'TRANSFER',abs(ar-current_balance),ar-current_balance,0,src,s,dt,'Receivables reconciliation');end if;
 a=private.default_account(u,'ACCOUNTS_PAYABLE',c);
 select balance into current_balance from public.accounts where id=a;
 if ap<>current_balance then perform private.entry(u,a,'TRANSFER',abs(ap-current_balance),ap-current_balance,0,src,s,dt,'Payables reconciliation');end if;
end $$;
create or replace function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s uuid=coalesce(p_id,gen_random_uuid()); g uuid=(p_input->>'groupId')::uuid; c text; creator uuid=auth.uid();
 old public.split_expenses; n numeric; kind text; dt timestamptz; cat uuid; description text;
 party jsonb; uid uuid; a uuid; paid numeric; owed numeric; share numeric; sum_paid numeric=0; sum_shares numeric=0;
 count_part integer; idx integer=0; allocated numeric=0; cents numeric; remainder integer;
 before_state jsonb; affected uuid[]='{}';
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into old from public.split_expenses where id=p_id;
 if not found then raise exception 'Split not found' using errcode='P0002'; end if;
 if old.creator_id<>auth.uid() and not exists(select 1 from public.groups where id=old.group_id and owner_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.settlements where group_id is not distinct from old.group_id) then raise exception 'Cannot change expenses after settlement'; end if;
 before_state=to_jsonb(old); creator=old.creator_id;
 select array_agg(distinct user_id) into affected from (select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s) old_parties;
 perform private.reverse_split(s);
 if p_delete then
 delete from public.split_expenses where id=s;
 foreach uid in array affected loop perform private.reconcile_virtual(uid,old.currency,'SPLIT',s,now());end loop;
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
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s union select unnest(affected) loop
 perform private.reconcile_virtual(uid,c,'SPLIT',s,dt);
 end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),case when p_id is null then 'CREATE' else 'UPDATE' end,jsonb_build_object('before',before_state,'after',p_input));
 return (select to_jsonb(e)||jsonb_build_object('payers',(select jsonb_agg(to_jsonb(p)) from public.split_payers p where split_expense_id=s),'participants',(select jsonb_agg(to_jsonb(p)) from public.split_participants p where split_expense_id=s)) from public.split_expenses e where id=s);
end $$;
create or replace function public.execute_settlement_atomic(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 perform private.reconcile_virtual(auth.uid(),c,'SETTLEMENT',s,dt);
 perform private.reconcile_virtual(payee,c,'SETTLEMENT',s,dt);
 return (select to_jsonb(v) from public.settlements v where id=s);
end $$;

revoke all on function private.ad_hoc_graph(uuid),private.reconcile_virtual(uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
