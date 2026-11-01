-- Ad-hoc expenses have no shared group context. Derive bilateral obligations
-- within each expense, then net each counterpart against this caller only.
-- This prevents one user's partial view of an ad-hoc network from authorizing
-- payments against another user's unrelated expenses.
create function private.ad_hoc_graph() returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; work jsonb; pairs jsonb='{}'; balances jsonb='{}'; edges jsonb='[]'; credit record; debt record; pair record; n numeric; other_id text; my_balance numeric=0;
begin
 for s in select id from public.split_expenses where group_id is null and private.can_read_split(id) loop
 select jsonb_object_agg(u,n) into work from (
 select u,sum(n) n from (
 select user_id u,amount_paid n from public.split_payers where split_expense_id=s.id
 union all select user_id,-amount_owed from public.split_participants where split_expense_id=s.id
 ) v group by u) q;
 loop
 select key,value::numeric amount into credit from jsonb_each_text(work) where value::numeric>0 order by value::numeric desc,key limit 1; exit when not found;
 select key,value::numeric amount into debt from jsonb_each_text(work) where value::numeric<0 order by value::numeric,key desc limit 1; exit when not found;
 n=least(credit.amount,-debt.amount);
 if debt.key=auth.uid()::text or credit.key=auth.uid()::text then
 other_id=case when debt.key=auth.uid()::text then credit.key else debt.key end;
 pairs=jsonb_set(pairs,array[other_id],to_jsonb(coalesce((pairs->>other_id)::numeric,0)+case when debt.key=auth.uid()::text then n else -n end));
 end if;
 work=jsonb_set(jsonb_set(work,array[credit.key],to_jsonb(credit.amount-n)),array[debt.key],to_jsonb(debt.amount+n));
 end loop;
 end loop;
 for s in select * from public.settlements where group_id is null and (payer_id=auth.uid() or payee_id=auth.uid()) loop
 other_id=case when s.payer_id=auth.uid() then s.payee_id::text else s.payer_id::text end;
 pairs=jsonb_set(pairs,array[other_id],to_jsonb(coalesce((pairs->>other_id)::numeric,0)+case when s.payer_id=auth.uid() then -s.amount else s.amount end));
 end loop;
 for pair in select key,value::numeric amount from jsonb_each_text(pairs) order by key loop
 my_balance=my_balance-pair.amount;
 balances=jsonb_set(balances,array[pair.key],to_jsonb(pair.amount));
 if pair.amount<>0 then edges=edges||jsonb_build_object('fromUserId',case when pair.amount>0 then auth.uid()::text else pair.key end,'toUserId',case when pair.amount>0 then pair.key else auth.uid()::text end,'amount',abs(pair.amount));end if;
 end loop;
 balances=jsonb_set(balances,array[auth.uid()::text],to_jsonb(my_balance));
 return jsonb_build_object('groupBalances',balances,'simplifiedTransactions',edges);
end $$;
create or replace function public.simplify_debts(p_group_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare balances jsonb; work jsonb; edges jsonb='[]'; credit record; debt record; n numeric;
begin
 if auth.uid() is null or (p_group_id is not null and not private.is_member(p_group_id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_group_id is null then return private.ad_hoc_graph(); end if;
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
create function public.debt_people() returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select u.id,u.name from public.users u where auth.uid() is not null and (
 exists(select 1 from public.split_payers p where p.user_id=u.id and private.can_read_split(p.split_expense_id))
 or exists(select 1 from public.split_participants p where p.user_id=u.id and private.can_read_split(p.split_expense_id))
 ) $$;
alter function private.valid_money(numeric) set search_path='';
revoke all on function private.ad_hoc_graph(),public.debt_people() from public,anon,authenticated;
grant execute on function public.debt_people() to authenticated;
