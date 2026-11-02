-- Run as one transaction in a dedicated test project; requires HTTP fixture users.
begin;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare a uuid;c uuid;b uuid;g uuid;t uuid;v jsonb;before_balance numeric;begin
 a=(public.manage_account('{"name":"Planning rollback","type":"BANK_ACCOUNT","balance":25}')->>'id')::uuid;
 insert into public.categories(user_id,name,type) values(auth.uid(),'Planning rollback','EXPENSE') returning id into c;
 insert into public.budgets(user_id,category_id,month,amount,currency) values(auth.uid(),c,'2025-01-01',20,'USD') returning id into b;
 insert into public.savings_goals(user_id,account_id,name,target_amount,currency) values(auth.uid(),a,'Planning rollback',100,'USD') returning id into g;
 if (select balance from public.accounts where id=a)<>25 or exists(select 1 from public.transactions where account_id=a) then raise exception 'Planning modified ledger';end if;
 t=(public.mutate_transaction_atomic(jsonb_build_object('accountId',a,'categoryId',c,'type','EXPENSE','amount',3,'dateTime','2025-01-15T12:00:00Z'))->>'id')::uuid;
 select x into v from jsonb_array_elements(public.budget_summary('2025-01-01')) x where x->>'id'=b::text;
 if (v->>'spent')::numeric<>3 then raise exception 'Incorrect budget spend';end if;
 perform public.copy_budgets('2025-02-01');
 if public.copy_budgets('2025-02-01')<>0 then raise exception 'Copy is not idempotent';end if;
 begin insert into public.savings_goals(user_id,account_id,name,target_amount,currency) values(auth.uid(),a,'Duplicate',200,'USD');raise exception 'Duplicate goal allowed';exception when unique_violation then null;end;
 perform set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
 begin insert into public.savings_goals(user_id,account_id,name,target_amount,currency) values(auth.uid(),a,'Forged account',200,'USD');raise exception 'Foreign account accepted';exception when raise_exception then if sqlerrm='Foreign account accepted' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
 insert into public.budgets(user_id,month,amount,currency) values(auth.uid(),'2034-01-01',10,'USD');
 begin update public.users set display_currency='INR' where id=auth.uid();raise exception 'Planning currency changed';exception when raise_exception then if sqlerrm='Planning currency changed' then raise;end if;end;
end $$;
rollback;
