-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/assignments-rls-check.sql
-- Read-only in effect: the test class, sets, cards and assignments are rolled back.
--
-- Setup: users A, B, C are three existing accounts (roles don't matter for RLS).
--   A owns sets S (2 cards) and S2, and teaches class X.
--   B is in class X; C is not. S is assigned to X; S2 isn't.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; c uuid; s uuid; s2 uuid; x uuid; asg uuid; v bigint; ok boolean; code text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;

  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'assign test S', 'flashcard') returning id into s;
  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'assign test S2', 'flashcard') returning id into s2;
  insert into public.flashcards (set_id, question, answer, position) values (s, 'Q1', 'A1', 0), (s, 'Q2', 'A2', 1), (s2, 'Q', 'A', 0);
  insert into public.classes (teacher_id, name, join_code) values (a, 'assign test X', 'ASGNXX') returning id into x;
  insert into public.class_members (class_id, student_id) values (x, b);
  insert into public.assignments (class_id, set_id, due_at) values (x, s, now() + interval '1 day') returning id into asg;

  -- B: in the class
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcard_sets where id = s;
  reset role; insert into results values (1, 'student in the class opens the assigned set', '1', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = s;
  reset role; insert into results values (2, '...and reads its cards', '2', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcard_sets where id = s2;
  reset role; insert into results values (3, 'student opens a set that is NOT assigned', '0', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.assignments where class_id = x;
  reset role; insert into results values (4, 'student sees their class''s assignments', '1', v::text);
  execute 'set local role authenticated';
  with u as (update public.flashcard_sets set title = 'hacked' where id = s returning 1) select count(*) into v from u;
  reset role; insert into results values (5, 'student edits the assigned set', '0 rows', v || ' rows');
  execute 'set local role authenticated';
  with d as (delete from public.flashcard_sets where id = s returning 1) select count(*) into v from d;
  reset role; insert into results values (6, 'student deletes the assigned set', '0 rows', v || ' rows');
  execute 'set local role authenticated';
  begin insert into public.assignments (class_id, set_id) values (x, s2); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (7, 'student creates an assignment directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin delete from public.assignments where id = asg; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (8, 'student removes an assignment directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- C: not in the class
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcard_sets where id = s;
  reset role; insert into results values (9, 'student outside the class opens the set', '0', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = s;
  reset role; insert into results values (10, '...or reads its cards', '0', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.assignments where class_id = x;
  reset role; insert into results values (11, '...or sees the class''s assignments', '0', v::text);

  -- A: the teacher
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.assignments where class_id = x;
  reset role; insert into results values (12, 'teacher sees their class''s assignments', '1', v::text);

  -- anon: clear the simulated sign-in first, or auth.uid() would still be A.
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin select count(*) into v from public.assignments; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (13, 'anon reads assignments', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role anon';
  select count(*) into v from public.flashcards where set_id = s;
  reset role; insert into results values (14, 'anon reads the assigned set''s cards', '0', v::text);

  -- constraints and unassigning
  begin insert into public.assignments (class_id, set_id) values (x, s); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (15, 'the same set assigned to a class twice', '23505', code);

  delete from public.assignments where id = asg;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = s;
  reset role; insert into results values (16, 'after unassigning, the student can''t read the cards', '0', v::text);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
