-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/study-types-check.sql
-- Read-only in effect: the test rows are rolled back.
--
-- New study types (#68, #69): the study_type checks on sets, attempts and the
-- generation log, the cards' explanation, and replace_set_cards() saving it.
-- User A is an existing account.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
grant all on results to service_role;
do $$
declare
  a uuid; st uuid; t1 uuid; t2 uuid;
  v bigint; code text; got text;
begin
  select id into a from auth.users order by created_at limit 1;

  -- study_type values
  begin insert into public.flashcard_sets (user_id, title, study_type) values (a, 'study type test TF', 'true_false') returning id into st; code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (1, 'a true-or-false set', 'inserted', code);
  begin insert into public.flashcard_sets (user_id, title, study_type) values (a, 'study type test bad', 'essay'); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (2, 'a set with an unknown study type', '23514', code);
  begin insert into public.attempts (id, user_id, set_id, study_type, score, total) values (gen_random_uuid(), a, st, 'true_false', 3, 4); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (3, 'a true-or-false attempt', 'inserted', code);
  begin insert into public.attempts (id, user_id, set_id, study_type, mode, score, total) values (gen_random_uuid(), a, st, 'true_false', 'type', 3, 4); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (4, 'a true-or-false attempt with a flashcard mode', '23514', code);
  begin insert into public.generation_logs (user_id, role, study_type, duration_ms, success) values (a, 'student', 'true_false', 1000, true); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (5, 'a true-or-false generation log', 'inserted', code);
  begin insert into public.generation_logs (user_id, role, study_type, duration_ms, success) values (a, 'student', 'essay', 1000, true); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (6, 'a generation log with an unknown study type', '23514', code);
  begin
    insert into public.flashcard_sets (user_id, title, study_type) values (a, 'study type test mixed', 'mixed');
    insert into public.attempts (id, user_id, set_id, study_type, score, total)
      select gen_random_uuid(), a, id, 'mixed', 5, 10 from public.flashcard_sets where title = 'study type test mixed';
    insert into public.generation_logs (user_id, role, study_type, duration_ms, success) values (a, 'teacher', 'mixed', 1000, true);
    code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (13, 'a mixed quiz set, attempt and generation log (#69)', 'inserted', code);

  -- explanation
  insert into public.flashcards (set_id, question, answer, options, explanation, position)
    values (st, 'Chloroplasts make ATP for the whole cell.', 'False', '["True","False"]', 'Mitochondria make most of the cell''s ATP.', 0)
    returning id into t1;
  begin insert into public.flashcards (set_id, question, answer, explanation, position) values (st, 'Q', 'True', repeat('x', 301), 1); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (7, 'an explanation over 300 characters', '23514', code);
  begin insert into public.flashcards (set_id, question, answer, explanation, position) values (st, 'Q', 'True', '', 1); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (8, 'an empty explanation (use null)', '23514', code);

  -- replace_set_cards() keeps, changes and clears explanations.
  execute 'set local role service_role';
  select string_agg(coalesce(r.explanation, '-'), ' | ' order by r.position) into got
  from public.replace_set_cards(st, a, jsonb_build_array(
    jsonb_build_object('id', t1, 'question', 'Chloroplasts make ATP for the whole cell.', 'answer', 'False',
                       'options', jsonb_build_array('True', 'False'), 'explanation', 'Mitochondria do.'),
    jsonb_build_object('question', 'Plants make glucose.', 'answer', 'True', 'options', jsonb_build_array('True', 'False'))
  )) as r;
  reset role;
  insert into results values (9, 'replace_set_cards returns explanations (null for none)', 'Mitochondria do. | -', got);
  select string_agg(coalesce(f.explanation, '-') || ' ' || f.answer, ' | ' order by f.position) into got from public.flashcards f where f.set_id = st;
  insert into results values (10, '...and saves them', 'Mitochondria do. False | - True', got);
  select id into t2 from public.flashcards where set_id = st and position = 1;
  execute 'set local role service_role';
  perform * from public.replace_set_cards(st, a, jsonb_build_array(
    jsonb_build_object('id', t1, 'question', 'Q1', 'answer', 'False', 'options', jsonb_build_array('True', 'False'), 'explanation', ''),
    jsonb_build_object('id', t2, 'question', 'Q2', 'answer', 'True', 'options', jsonb_build_array('True', 'False'), 'explanation', 'Now explained.')
  ));
  reset role;
  select string_agg(coalesce(f.explanation, '-'), ' | ' order by f.position) into got from public.flashcards f where f.set_id = st;
  insert into results values (11, 'an empty explanation clears it; a new one is added', '- | Now explained.', got);

  -- Still only the service role may call it.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from public.replace_set_cards(st, a, '[]'::jsonb); code := 'ALLOWED';
  exception when others then code := 'denied'; end;
  reset role;
  insert into results values (12, 'the owner calls replace_set_cards from the browser', 'denied', code);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
