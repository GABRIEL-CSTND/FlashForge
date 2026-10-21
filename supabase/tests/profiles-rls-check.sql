-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/profiles-rls-check.sql
-- Read-only in effect: everything (including the test sign-ups) is rolled back.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare a uuid; b uuid; v bigint; ok boolean; msg text; new_id uuid := gen_random_uuid(); new_id2 uuid := gen_random_uuid();
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.profiles where id = a;
  reset role; insert into results values (1, 'user reads own profile', '1', v::text);

  execute 'set local role authenticated';
  select count(*) into v from public.profiles where id <> a;
  reset role; insert into results values (2, 'user reads other users'' profiles', '0', v::text);

  execute 'set local role authenticated';
  begin update public.profiles set role = 'admin' where id = a; ok := true;
  exception when others then ok := false; msg := sqlerrm; end;
  reset role; insert into results values (3, 'user makes THEMSELVES admin', 'denied', case when ok then 'ALLOWED' else 'denied (' || msg || ')' end);

  execute 'set local role authenticated';
  begin update public.profiles set role_chosen_at = now() where id = a; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (4, 'user sets own role_chosen_at directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  execute 'set local role authenticated';
  with u as (update public.profiles set display_name = 'New Name' where id = a returning 1) select count(*) into v from u;
  reset role; insert into results values (5, 'user changes own display_name', '1 rows', v || ' rows');

  execute 'set local role authenticated';
  with u as (update public.profiles set display_name = 'hacked' where id = b returning 1) select count(*) into v from u;
  reset role; insert into results values (6, 'user changes someone else''s name', '0 rows', v || ' rows');

  execute 'set local role authenticated';
  begin insert into public.profiles (id, role) values (gen_random_uuid(), 'admin'); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (7, 'user inserts an admin profile', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  begin select count(*) into v from public.profiles; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (8, 'anon reads profiles', 'denied', case when ok then 'ALLOWED (' || v || ')' else 'denied' end);

  -- sign-up trigger
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (new_id, 'authenticated', 'authenticated', 'trigger-test@example.com', '{"full_name":"Trigger Test"}', now(), now());
  select count(*) into v from public.profiles where id = new_id and role = 'student' and display_name = 'Trigger Test' and role_chosen_at is null;
  insert into results values (9, 'new sign-up gets a student profile', '1', v::text);

  -- a failing profile insert must not block the sign-up
  alter table public.profiles add constraint tmp_force_fail check (false) not valid;
  begin
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (new_id2, 'authenticated', 'authenticated', 'trigger-test2@example.com', now(), now());
    ok := true;
  exception when others then ok := false; msg := sqlerrm; end;
  select count(*) into v from public.profiles where id = new_id2;
  insert into results values (10, 'sign-up still works if profile insert fails', 'user created, 0 profiles',
    case when ok then 'user created, ' || v || ' profiles' else 'SIGN-UP BLOCKED: ' || msg end);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
