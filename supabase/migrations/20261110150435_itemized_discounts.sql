-- Normalizes item allocations inside the trusted accounting boundary. Client
-- supplied exact shares cannot override item totals. All arithmetic uses cents.
create or replace function private.itemized_split_input(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare
 v jsonb=p->'itemization'; item jsonb; party jsonb; ids jsonb; uid text;
 allocations jsonb='{}'; original jsonb; result jsonb='[]';
 subtotal numeric=0; extras numeric; n numeric; base numeric; remainder integer;
 discount numeric; total numeric; allocated numeric=0; count_users integer;
begin
 if v is null or v='null'::jsonb then return p;end if;
 if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'items') is distinct from 'array' or jsonb_array_length(v->'items') not between 1 and 100
 or jsonb_typeof(p->'participants') is distinct from 'array' or jsonb_array_length(p->'participants') not between 1 and 50 then raise exception 'Invalid itemization';end if;
 if exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'userId' having count(*)>1) then raise exception 'Duplicate itemization participants';end if;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId'; if uid is null then raise exception 'Missing participant';end if;
 allocations=jsonb_set(allocations,array[uid],'0');
 end loop;
 for item in select value from jsonb_array_elements(v->'items') loop
 n=(item->>'amount')::numeric;ids=item->'participantIds';
 if not private.valid_money(n) or nullif(trim(item->>'label'),'') is null or length(item->>'label')>120
 or jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)=0 then raise exception 'Every item needs a valid amount, name and participants';end if;
 if exists(select 1 from jsonb_array_elements_text(ids) x where not allocations ? x)
 or (select count(*)<>count(distinct x) from jsonb_array_elements_text(ids) x) then raise exception 'Invalid or duplicate item participants';end if;
 count_users=jsonb_array_length(ids);base=floor(n*100/count_users);remainder=(n*100-base*count_users)::integer;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';
 if ids ? uid then
 allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+base+case when remainder>0 then 1 else 0 end));remainder=remainder-1;
 end if;
 end loop;
 subtotal=subtotal+n*100;
 end loop;
 extras=coalesce((v->>'tax')::numeric,0)+coalesce((v->>'tip')::numeric,0);
 if coalesce((v->>'tax')::numeric,0)<0 or coalesce((v->>'tip')::numeric,0)<0
 or coalesce((v->>'tax')::numeric,0)<>round(coalesce((v->>'tax')::numeric,0),2)
 or coalesce((v->>'tip')::numeric,0)<>round(coalesce((v->>'tip')::numeric,0),2) then raise exception 'Tax and tip must be nonnegative cents';end if;
 discount=coalesce((v->>'discount')::numeric,0);
 if discount<0 or discount<>round(discount,2) or discount*100>subtotal then raise exception 'Discount must be nonnegative cents and cannot exceed the item subtotal';end if;
 extras=(extras-discount)*100;total=(subtotal+extras)/100;
 if not private.valid_money(total) or total is distinct from (p->>'totalAmount')::numeric then raise exception 'Items, tax, tip and discount must equal the expense total';end if;
 original=allocations;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';n=floor(extras*(original->>uid)::numeric/subtotal);allocated=allocated+n;
 allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+n));
 end loop;
 remainder=(extras-allocated)::integer;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';
 if remainder>0 and (original->>uid)::numeric>0 then allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+1));remainder=remainder-1;end if;
 result=result||jsonb_build_array(jsonb_build_object('userId',uid,'shareValue',(allocations->>uid)::numeric/100));
 end loop;
 return jsonb_set(jsonb_set(p,'{participants}',result),'{splitType}','"EXACT"');
end $$;
revoke all on function private.itemized_split_input(jsonb) from public,anon,authenticated;

