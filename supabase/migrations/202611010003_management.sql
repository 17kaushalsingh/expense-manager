create function public.manage_account(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.accounts; c text; s uuid=coalesce(p_id,gen_random_uuid()); t text; n numeric;
begin
 perform private.lock_ledger();
 select display_currency into c from public.users where id=auth.uid();
 if p_id is not null then
 select * into a from public.accounts where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Account not found' using errcode='P0002'; end if;
 if a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') or a.is_default then raise exception 'System accounts cannot be modified'; end if;
 if p_delete then delete from public.accounts where id=p_id; return '{}'::jsonb; end if;
 if exists(select 1 from public.transactions where account_id=p_id) and (p_input ? 'balance' or (p_input ? 'type' and p_input->>'type'<>a.type)) then raise exception 'Cannot change balance or type after transactions'; end if;
 end if;
 if coalesce(p_input->>'currency',c)<>c then raise exception 'Account currency must match profile'; end if;
 t=coalesce(p_input->>'type',a.type); n=coalesce((p_input->>'balance')::numeric,a.balance,0);
 if n<>round(n,2) or abs(n)>=1000000000000 then raise exception 'Invalid balance'; end if;
 if t is null or t not in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT','CREDIT_CARD','LOAN') then raise exception 'Invalid account type'; end if;
 if p_id is null then
 insert into public.accounts(id,user_id,name,type,currency,balance,metadata) values(s,auth.uid(),trim(p_input->>'name'),t,c,n,p_input->'metadata');
 else update public.accounts set name=coalesce(trim(p_input->>'name'),a.name),type=t,balance=n,metadata=coalesce(p_input->'metadata',a.metadata) where id=s; end if;
 return (select to_jsonb(x) from public.accounts x where id=s);
end $$;
create function public.update_profile(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users; c text; tz text;
begin
 perform private.lock_ledger(); select * into u from public.users where id=auth.uid();
 c=coalesce(p_input->>'displayCurrency',u.display_currency); tz=coalesce(p_input->>'timezone',u.timezone);
 if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Invalid timezone'; end if;
 if c<>u.display_currency then
 if exists(select 1 from public.transactions where user_id=u.id) or exists(select 1 from public.accounts where user_id=u.id and balance<>0)
 or exists(select 1 from public.split_participants where user_id=u.id) or exists(select 1 from public.split_payers where user_id=u.id)
 or exists(select 1 from public.group_members m join public.groups g on g.id=m.group_id where m.user_id=u.id and g.currency<>c)
 then raise exception 'Cannot change currency after financial activity or while in a different currency group'; end if;
 update public.accounts set currency=c where user_id=u.id;
 end if;
 update public.users set name=coalesce(trim(p_input->>'name'),name),display_currency=c,timezone=tz where id=u.id;
 return (select to_jsonb(x) from public.users x where id=u.id);
end $$;
create function public.manage_group(p_input jsonb,p_id uuid default null,p_action text default 'UPDATE') returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.groups; s uuid=coalesce(p_id,gen_random_uuid()); c text; u uuid; n numeric;
begin
 perform private.lock_ledger();
 if p_id is null then
 select display_currency into c from public.users where id=auth.uid();
 if coalesce(p_input->>'currency',c)<>c then raise exception 'Group currency must match profile'; end if;
 insert into public.groups(id,owner_id,name,currency) values(s,auth.uid(),trim(p_input->>'name'),c);
 insert into public.group_members(group_id,user_id) values(s,auth.uid());
 for u in select distinct value::uuid from jsonb_array_elements_text(coalesce(p_input->'memberIds','[]')) loop
 if not exists(select 1 from public.users where id=u and display_currency=c) then raise exception 'Member not found or currency mismatch'; end if;
 insert into public.group_members(group_id,user_id) values(s,u) on conflict do nothing;
 end loop;
 else
 select * into g from public.groups where id=s and owner_id=auth.uid();
 if not found then raise exception 'Only the group owner can manage this group' using errcode='42501'; end if;
 if p_action='DELETE' then
 if exists(select 1 from public.split_expenses where group_id=s) or exists(select 1 from public.settlements where group_id=s) then raise exception 'Cannot delete a group with financial history'; end if;
 delete from public.groups where id=s; return '{}'::jsonb;
 elsif p_action='ADD_MEMBER' then
 u=(p_input->>'userId')::uuid;
 if not exists(select 1 from public.users where id=u and display_currency=g.currency) then raise exception 'Member not found or currency mismatch'; end if;
 insert into public.group_members(group_id,user_id) values(s,u);
 elsif p_action='REMOVE_MEMBER' then
 u=(p_input->>'userId')::uuid;
 if u=g.owner_id then raise exception 'Cannot remove the group owner'; end if;
 select balance into n from private.context_balances(s) where user_id=u;
 if coalesce(n,0)<>0 then raise exception 'Settle outstanding debt before removing member'; end if;
 delete from public.group_members where group_id=s and user_id=u;
 if not found then raise exception 'Member not found' using errcode='P0002'; end if;
 else
 if p_input ? 'currency' and p_input->>'currency'<>g.currency then raise exception 'Group currency is fixed'; end if;
 update public.groups set name=coalesce(trim(p_input->>'name'),name) where id=s;
 end if;
 end if;
 return (select to_jsonb(x)||jsonb_build_object('members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.group_members m where group_id=s)) from public.groups x where id=s);
end $$;
revoke all on function public.manage_account(jsonb,uuid,boolean),public.update_profile(jsonb),public.manage_group(jsonb,uuid,text) from public,anon;
grant execute on function public.manage_account(jsonb,uuid,boolean),public.update_profile(jsonb),public.manage_group(jsonb,uuid,text) to authenticated;
