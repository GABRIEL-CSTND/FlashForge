-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/attempts-rls-check.sql
-- Read-only in effect: the test data is rolled back.
--
-- Setup: users A, B, C are three existing accounts (roles don't matter for RLS).
--   A owns set S and teaches class X; B is in X; C is not. S is assigned to X.
--   B: one attempt from the assignment (b_asg), one private attempt (b_priv).
--   C: one private attempt on their own set SC (c_own).
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; c uuid; s uuid; sc uuid; x uuid; asg uuid;
  b_asg uuid := gen_random_uuid(); b_priv uuid := gen_random_uuid(); c_own uuid := gen_random_uuid();
  v bigint; ok boolean; code text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;

  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'attempt test S', 'multiple_choice') returning id into s;
  insert into public.flashcard_sets (user_id, title, study_type) values (c, 'attempt test SC', 'flashcard') returning id into sc;
  insert into public.classes (teacher_id, name, join_code) values (a, 'attempt test X', 'ATTMPX') returning id into x;
  insert into public.class_members (class_id, student_id) values (x, b);
  insert into public.assignments (class_id, set_id) values (x, s) returning id into asg;
  insert into public.attempts (id, user_id, set_id, assignment_id, study_type, score, total) values
    (b_asg, b, s, asg, 'multiple_choice', 7, 10),
    (b_priv, b, s, null, 'multiple_choice', 9, 10),
    (c_own, c, sc, null, 'flashcard', 3, 5);

  -- B: the student
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id in (b_asg, b_priv, c_own);
  reset role; insert into results values (1, 'student reads only their own attempts', '2', v::text);
  execute 'set local role authenticated';
  begin insert into public.attempts (id, user_id, set_id, study_type, score, total) values (gen_random_uuid(), b, s, 'multiple_choice', 10, 10); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (2, 'student records an attempt directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin update public.attempts set score = 10 where id = b_asg; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (3, 'student raises their own score directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin delete from public.attempts where id = b_asg; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (4, 'student deletes an attempt directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- A: the teacher
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = b_asg;
  reset role; insert into results values (5, 'teacher reads a student''s assignment attempt', '1', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = b_priv;
  reset role; insert into results values (6, 'teacher reads the same student''s PRIVATE attempt', '0', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = c_own;
  reset role; insert into results values (7, 'teacher reads someone else''s private attempt', '0', v::text);

  -- C: not in the class, not B
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id in (b_asg, b_priv);
  reset role; insert into results values (8, 'another user reads B''s attempts', '0', v::text);

  -- B leaves the class: the teacher stops seeing B's assignment attempt
  delete from public.class_members where class_id = x and student_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = b_asg;
  reset role; insert into results values (9, 'after the student leaves, the teacher can''t see it', '0', v::text);
  insert into public.class_members (class_id, student_id) values (x, b);

  -- Unassigning keeps the attempt but makes it private
  delete from public.assignments where id = asg;
  select count(*) into v from public.attempts where id = b_asg and assignment_id is null;
  insert into results values (10, 'unassigning keeps the attempt, now private', '1', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = b_asg;
  reset role; insert into results values (11, '...and the teacher can no longer see it', '0', v::text);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.attempts where id = b_asg;
  reset role; insert into results values (12, '...but the student still can', '1', v::text);

  -- anon
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin select count(*) into v from public.attempts; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (13, 'anon reads attempts', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- constraints
  begin insert into public.attempts (id, user_id, set_id, study_type, score, total) values (gen_random_uuid(), b, s, 'multiple_choice', 11, 10); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (14, 'score higher than total', '23514', code);
  begin insert into public.attempts (id, user_id, set_id, study_type, score, total) values (gen_random_uuid(), b, s, 'essay', 1, 1); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (15, 'unknown study type', '23514', code);
  begin insert into public.attempts (id, user_id, set_id, study_type, score, total) values (b_asg, b, s, 'multiple_choice', 1, 1); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (16, 'the same attempt id twice', '23505', code);

  delete from public.flashcard_sets where id = sc;
  select count(*) into v from public.attempts where id = c_own;
  insert into results values (17, 'deleting a set deletes its attempts', '0', v::text);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
