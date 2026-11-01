-- Dedicated test identities only. Set test.password in the same connection first.
-- NEVER run this against a project containing these reserved fixture IDs.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,extensions.crypt(current_setting('test.password'),extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name',name),'','','','',now(),now()
from (values
 ('55555555-5555-4555-8555-555555555555'::uuid,'http-a@example.invalid','HTTP Alice'),
 ('66666666-6666-4666-8666-666666666666'::uuid,'http-b@example.invalid','HTTP Bob'),
 ('77777777-7777-4777-8777-777777777777'::uuid,'http-c@example.invalid','HTTP Cara')) v(id,email,name);
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
select gen_random_uuid(),id,id::text,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now() from auth.users where id in ('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777');
