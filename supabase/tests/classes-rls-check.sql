-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/classes-rls-check.sql
-- Read-only in effect: the test classes, memberships and attempts are rolled back.
--
-- Setup: users A, B, C are three existing accounts (roles don't matter for RLS).
--   class X: teacher A, members B and C
--   class Y: teacher B, member C
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
grant all on results to service_role;
do $$
declare
  a uuid; b uuid; c uuid; x uuid; y uuid; v bigint; ok boolean; code text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;

  insert into public.classes (teacher_id, name, join_code) values (a, 'RLS test X', 'TESTXA') returning id into x;
  insert into public.classes (teacher_id, name, join_code) values (b, 'RLS test Y', 'TESTYB') returning id into y;
  insert into public.class_members (class_id, student_id) values (x, b), (x, c), (y, c);

  -- teacher A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.classes where id in (x, y);
  reset role; insert into results values (1, 'teacher A sees only their own class', '1', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.class_members where class_id = x;
  reset role; insert into results values (2, 'teacher A sees their roster', '2', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.class_members where class_id = y;
  reset role; insert into results values (3, 'teacher A sees another teacher''s roster', '0', v::text);
  execute 'set local role authenticated';
  begin update public.classes set name = 'hijacked' where id = y; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (4, 'teacher A renames another teacher''s class', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin update public.classes set join_code = 'ZZZZZZ' where id = x; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (5, 'teacher A edits own class directly (must use server)', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- student C (member of X and Y)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.classes where id in (x, y);
  reset role; insert into results values (6, 'student C sees both classes they joined', '2', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.class_members where class_id = x;
  reset role; insert into results values (7, 'student C sees only their own row in X', '1', v::text);
  execute 'set local role authenticated';
  begin insert into public.class_members (class_id, student_id) values (y, a); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (8, 'student C adds someone to a class', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin insert into public.classes (teacher_id, name, join_code) values (c, 'mine', 'MINECC'); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (9, 'student C creates a class directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- teacher B is also a member of X: sees Y as teacher, X as member
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.class_members where class_id = y;
  reset role; insert into results values (10, 'teacher B sees their own roster (Y)', '1', v::text);

  -- anon and the roster function
  execute 'set local role anon';
  begin select count(*) into v from public.classes; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (11, 'anon reads classes', 'denied', case when ok then 'ALLOWED (' || v || ')' else 'denied' end);
  execute 'set local role authenticated';
  begin select count(*) into v from public.class_roster(x, a); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (12, 'signed-in user calls class_roster', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role service_role';
  select count(*) into v from public.class_roster(x, a) where email is not null;
  reset role; insert into results values (13, 'server roster for the class''s teacher (with emails)', '2', v::text);
  execute 'set local role service_role';
  select count(*) into v from public.class_roster(x, b);
  reset role; insert into results values (14, 'server roster when someone else is passed as teacher', '0', v::text);

  -- constraints
  begin insert into public.classes (teacher_id, name, join_code) values (a, 'dup', 'TESTXA'); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (15, 'duplicate join code', '23505', code);
  begin insert into public.classes (teacher_id, name, join_code) values (a, '   ', 'O0I1LL'); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (16, 'blank name / look-alike characters', '23514', code);

  -- #54: joining and leaving only happen through the server
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin delete from public.class_members where class_id = y and student_id = c; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (17, 'student C leaves a class directly (must use server)', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin select count(*) into v from public.class_join_failures; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (18, 'signed-in user reads the wrong-code log', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin insert into public.class_join_failures (user_id) values (c); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (19, 'signed-in user writes the wrong-code log', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role anon';
  begin select count(*) into v from public.class_join_failures; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (20, 'anon reads the wrong-code log', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role service_role';
  insert into public.class_join_failures (user_id) values (c);
  select count(*) into v from public.class_join_failures where user_id = c and attempted_at > now() - interval '1 minute';
  reset role; insert into results values (21, 'server records a wrong-code attempt', '1', v::text);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
