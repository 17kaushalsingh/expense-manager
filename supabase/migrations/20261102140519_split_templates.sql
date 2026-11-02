create table public.split_templates (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups on delete cascade,
 creator_id uuid not null references public.users, name text not null check(length(trim(name))>0),
 payload jsonb not null, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index templates_group on public.split_templates(group_id);
create index templates_creator on public.split_templates(creator_id);
create trigger touch_updated before update on public.split_templates for each row execute function private.touch_updated();
-- Canonical, account/category-free payload. Validate again at posting via the ledger RPC.
create function private.validate_template(g uuid,p jsonb,complete boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare c text; n numeric=(p->>'totalAmount')::numeric; k text=p->>'splitType'; v jsonb; uid uuid; w numeric; total numeric=0; paid numeric=0; parties jsonb='[]'; payers jsonb='[]';
begin
 select currency into c from public.groups where id=g;
 if c is null then raise exception 'Group not found'; end if;
 if coalesce(p->>'currency',c)<>c then raise exception 'Currency mismatch'; end if;
 if nullif(trim(p->>'description'),'') is null or k is null or k not in ('EQUAL','EXACT','PERCENTAGE','SHARES') then raise exception 'Invalid template description or split mode'; end if;
 if n is not null and not private.valid_money(n) then raise exception 'Invalid total'; end if;
 if complete and n is null then raise exception 'A complete total is required'; end if;
 if coalesce(jsonb_array_length(p->'participants'),0)=0 or coalesce(jsonb_array_length(p->'payers'),0)=0 then raise exception 'Participants and payers are required'; end if;
 if exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'userId' having count(*)>1) or exists(select 1 from jsonb_array_elements(p->'payers') x group by x->>'userId' having count(*)>1) then raise exception 'Duplicate parties'; end if;
 for v in select value from jsonb_array_elements((p->'participants')||(p->'payers')) loop
 uid=(v->>'userId')::uuid;
 if not exists(select 1 from public.group_members m join public.users u on u.id=m.user_id where m.group_id=g and m.user_id=uid and u.display_currency=c) then raise exception 'A saved party is no longer a compatible group member'; end if;
 if v ? 'accountId' or v ? 'categoryId' then raise exception 'Private account/category IDs cannot be saved in templates'; end if;
 end loop;
 if p ? 'categoryId' or p ? 'accountId' then raise exception 'Private account/category IDs cannot be saved in templates'; end if;
 for v in select value from jsonb_array_elements(p->'participants') loop
 w=case when k='EQUAL' then 1 else (v->>'shareValue')::numeric end;
 if w is null or w<0 or w<>round(w,4) or (k='EXACT' and w<>round(w,2)) then raise exception 'Invalid share'; end if;
 total=total+w;
 parties=parties||jsonb_build_object('userId',v->>'userId','shareValue',w);
 end loop;
 if total<=0 or (k='PERCENTAGE' and total<>100) or (k='EXACT' and n is not null and total<>n) then raise exception 'Invalid allocation total'; end if;
 for v in select value from jsonb_array_elements(p->'payers') loop
 w=(v->>'amountPaid')::numeric;
 if w is not null and not private.valid_money(w) then raise exception 'Invalid payer amount'; end if;
 if n is not null and w is null then raise exception 'Payer amounts are required with a total'; end if;
 paid=paid+coalesce(w,0);
 payers=payers||jsonb_strip_nulls(jsonb_build_object('userId',v->>'userId','amountPaid',w));
 end loop;
 if n is not null and paid<>n then raise exception 'Payments must equal total'; end if;
 return jsonb_build_object('groupId',g,'currency',c,'description',trim(p->>'description'),'totalAmount',n,'splitType',k,'participants',parties,'payers',payers);
end $$;
create function private.template_valid(g uuid,p jsonb) returns boolean language plpgsql stable set search_path='' as $$
begin perform private.validate_template(g,p); return true; exception when others then return false; end $$;
create function public.list_split_templates(p_group_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_member(p_group_id) then raise exception 'Group not found' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('needsCorrection',not private.template_valid(t.group_id,t.payload)) order by t.created_at desc),'[]') from public.split_templates t where group_id=p_group_id and archived_at is null);
end $$;
create function public.manage_split_template(p_group_id uuid,p_input jsonb,p_id uuid default null,p_archive boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.split_templates; v uuid=coalesce(p_id,gen_random_uuid()); body jsonb;
begin
 perform private.lock_ledger();
 if not private.is_member(p_group_id) then raise exception 'Group not found' using errcode='42501'; end if;
 if p_id is not null then
 select * into t from public.split_templates where id=p_id and group_id=p_group_id;
 if not found then raise exception 'Template not found' using errcode='P0002'; end if;
 if t.creator_id<>auth.uid() and not exists(select 1 from public.groups where id=p_group_id and owner_id=auth.uid()) then raise exception 'Only creator or group owner can change template' using errcode='42501'; end if;
 end if;
 if p_archive and p_id is not null then
 update public.split_templates set archived_at=now() where id=p_id;
 else
 if nullif(trim(p_input->>'name'),'') is null then raise exception 'Template name is required'; end if;
 body=private.validate_template(p_group_id,p_input->'payload');
 if p_id is null then insert into public.split_templates(id,group_id,creator_id,name,payload) values(v,p_group_id,auth.uid(),trim(p_input->>'name'),body);
 else update public.split_templates set name=trim(p_input->>'name'),payload=body where id=v; end if;
 end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('SplitTemplate',v,auth.uid(),case when p_archive then 'ARCHIVE' when p_id is null then 'CREATE' else 'UPDATE' end);
 return (select to_jsonb(x) from public.split_templates x where id=v);
end $$;
alter table public.split_templates enable row level security;
revoke all on public.split_templates from anon,authenticated;
grant select on public.split_templates to authenticated;
create policy member_templates on public.split_templates for select to authenticated using(private.is_member(group_id));
revoke all on function private.validate_template(uuid,jsonb,boolean),private.template_valid(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.list_split_templates(uuid),public.manage_split_template(uuid,jsonb,uuid,boolean) from public,anon;
grant execute on function public.list_split_templates(uuid),public.manage_split_template(uuid,jsonb,uuid,boolean) to authenticated;
