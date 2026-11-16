-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/admin-users-check.sql
-- Read-only in effect: everything is rolled back.
--
-- Setup: A is an existing admin; B and C are two other existing accounts. To
-- test "last admin" whatever the live data is, every other admin is first made
-- a teacher inside this transaction, so A is the only admin.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; c uuid; v bigint; old text; ok boolean; code text; msg text;
begin
  select id into a from public.profiles where role = 'admin' order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;
  update public.profiles set role = 'teacher' where role = 'admin' and id <> a;
  update public.profiles set role = 'student', role_chosen_at = null where id in (b, c);

  -- Browsers
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from public.audit_log; ok := true; exception when others then ok := false; end;
  reset role; insert into results values (1, 'signed-in user (even an admin) reads audit_log directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform public.admin_change_role(a, b, 'admin'); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (2, 'signed-in user calls admin_change_role', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform * from public.admin_list_users(null, 10); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (3, 'signed-in user calls admin_list_users', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin perform count(*) from public.audit_log; ok := true; exception when others then ok := false; end;
  reset role; insert into results values (4, 'anon reads audit_log', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- Server (service role)
  select count(*) into v from public.admin_list_users(null, 500) where user_id in (a, b, c);
  insert into results values (5, 'admin_list_users lists the users', '3', v::text);
  select count(*) into v from public.admin_list_users((select email from auth.users where id = b), 500);
  insert into results values (6, 'admin_list_users finds a user by email', '1', v::text);

  old := public.admin_change_role(a, b, 'teacher');
  insert into results values (7, 'admin makes B a teacher (returns old role)', 'student', old);
  select count(*) into v from public.profiles where id = b and role = 'teacher' and role_chosen_at is not null;
  insert into results values (8, 'B is a teacher and the role counts as chosen', '1', v::text);
  select count(*) into v from public.audit_log where actor_id = a and target_id = b and action = 'role_change'
    and details = '{"from": "student", "to": "teacher"}'::jsonb;
  insert into results values (9, 'the change is in audit_log (who, whom, from, to)', '1', v::text);

  old := public.admin_change_role(a, b, 'teacher');
  select count(*) into v from public.audit_log where target_id = b;
  insert into results values (10, 'setting the same role again is not logged', '1', v::text);

  begin perform public.admin_change_role(b, c, 'admin'); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (11, 'a non-admin (teacher B) changes a role', 'denied 42501', case when ok then 'ALLOWED' else 'denied ' || code end);

  begin perform public.admin_change_role(a, a, 'teacher'); ok := true; msg := null;
  exception when others then ok := false; get stacked diagnostics msg = message_text; end;
  insert into results values (12, 'the only admin demotes themselves', 'denied last_admin', case when ok then 'ALLOWED' else 'denied ' || msg end);

  old := public.admin_change_role(a, c, 'admin');
  old := public.admin_change_role(c, a, 'student');
  select role into old from public.profiles where id = a;
  insert into results values (13, 'with 2 admins, one can demote the other', 'student', old);
  begin perform public.admin_change_role(c, c, 'teacher'); ok := true; msg := null;
  exception when others then ok := false; get stacked diagnostics msg = message_text; end;
  insert into results values (14, 'then the remaining admin cannot step down', 'denied last_admin', case when ok then 'ALLOWED' else 'denied ' || msg end);

  begin perform public.admin_change_role(c, gen_random_uuid(), 'teacher'); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (15, 'an unknown user', 'denied P0002', case when ok then 'ALLOWED' else 'denied ' || code end);
  begin perform public.admin_change_role(c, b, 'owner'); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (16, 'an unknown role', 'denied 22023', case when ok then 'ALLOWED' else 'denied ' || code end);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
