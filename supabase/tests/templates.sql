begin;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare g uuid;t uuid;p jsonb;payload jsonb;s text;begin
 g=(public.manage_group('{"name":"Template rollback","memberIds":["66666666-6666-4666-8666-666666666666"]}')->>'id')::uuid;
 p=jsonb_build_object('description','Rent','totalAmount',10.01,'splitType','EQUAL','payers',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'amountPaid',10.01)),'participants',jsonb_build_array(jsonb_build_object('userId',auth.uid()),jsonb_build_object('userId','66666666-6666-4666-8666-666666666666')));
 t=(public.manage_split_template(g,jsonb_build_object('name','Rent','payload',p))->>'id')::uuid;
 foreach s in array array['EXACT','PERCENTAGE','SHARES'] loop
 payload=jsonb_set(jsonb_set(p,'{splitType}',to_jsonb(s)),'{participants}',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'shareValue',case s when 'EXACT' then 5 else 50 end),jsonb_build_object('userId','66666666-6666-4666-8666-666666666666','shareValue',case s when 'EXACT' then 5.01 else 50 end)));
 perform public.manage_split_template(g,jsonb_build_object('name',s,'payload',payload));end loop;
 begin perform public.manage_split_template(g,jsonb_build_object('name','Bad','payload',p||jsonb_build_object('categoryId',g)));raise exception 'Private fields accepted';exception when raise_exception then if sqlerrm='Private fields accepted' then raise;end if;end;
 if exists(select 1 from public.split_expenses where group_id=g) then raise exception 'Templates changed ledger';end if;
 perform set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
 begin perform public.manage_split_template(g,'{}',t,true);raise exception 'Unauthorized archive';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
 perform public.manage_group(jsonb_build_object('userId','66666666-6666-4666-8666-666666666666'),g,'REMOVE_MEMBER');
 if not (public.list_split_templates(g)->0->>'needsCorrection')::boolean then raise exception 'Missing correction flag';end if;
end $$;
rollback;
