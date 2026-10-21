-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/sets-editing-check.sql
-- Read-only in effect: the test sets and cards are rolled back.
--
-- Checks public.replace_set_cards() (#55). Users A and B are two existing accounts.
--   set SA (flashcards, owner A): cards c1, c2, c3
--   set SM (multiple choice, owner A): card m1
--   set SB (flashcards, owner B): card b1
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
grant all on results to service_role;
do $$
declare
  a uuid; b uuid; sa uuid; sm uuid; sb uuid; c1 uuid; c2 uuid; c3 uuid; b1 uuid;
  v bigint; ok boolean; code text; got text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;

  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'edit test SA', 'flashcard') returning id into sa;
  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'edit test SM', 'multiple_choice') returning id into sm;
  insert into public.flashcard_sets (user_id, title, study_type) values (b, 'edit test SB', 'flashcard') returning id into sb;
  insert into public.flashcards (set_id, question, answer, position) values (sa, 'Q1', 'A1', 0) returning id into c1;
  insert into public.flashcards (set_id, question, answer, position) values (sa, 'Q2', 'A2', 1) returning id into c2;
  insert into public.flashcards (set_id, question, answer, position) values (sa, 'Q3', 'A3', 2) returning id into c3;
  insert into public.flashcards (set_id, question, answer, position) values (sb, 'QB', 'AB', 0) returning id into b1;
  insert into public.flashcards (set_id, question, answer, options, position)
    values (sm, 'Which layer?', 'Network', '["Network","Physical","Transport","Session"]', 0);

  execute 'set local role service_role';

  -- Move c3 first, edit c1, drop c2, add a new card.
  perform * from public.replace_set_cards(sa, a, jsonb_build_array(
    jsonb_build_object('id', c3, 'question', 'Q3', 'answer', 'A3'),
    jsonb_build_object('id', c1, 'question', 'Q1 edited', 'answer', 'A1 edited'),
    jsonb_build_object('question', 'Q new', 'answer', 'A new')
  ));
  select string_agg(case f.id when c1 then 'c1' when c3 then 'c3' else 'new' end || '@' || f.position || ':' || f.question, ', ' order by f.position)
    into got from public.flashcards f where f.set_id = sa;
  insert into results values (1, 'edit: order, kept ids, edited text, new card', 'c3@0:Q3, c1@1:Q1 edited, new@2:Q new', got);
  select count(*) into v from public.flashcards where id = c2;
  insert into results values (2, 'edit: removed card is deleted', '0', v::text);
  select count(*) into v from public.flashcards where set_id = sa and options is not null;
  insert into results values (3, 'edit: flashcards have no choices', '0', v::text);

  begin perform * from public.replace_set_cards(sa, b, '[]'::jsonb); code := 'ran';
  exception when others then code := sqlstate; end;
  insert into results values (4, 'someone else saves A''s set', 'P0002', code);

  begin perform * from public.replace_set_cards(gen_random_uuid(), a, '[]'::jsonb); code := 'ran';
  exception when others then code := sqlstate; end;
  insert into results values (5, 'save to a set that doesn''t exist', 'P0002', code);

  begin
    perform * from public.replace_set_cards(sa, a, jsonb_build_array(
      jsonb_build_object('id', c1, 'question', 'should not stick', 'answer', 'x'),
      jsonb_build_object('id', b1, 'question', 'stolen', 'answer', 'x')
    ));
    code := 'ran';
  exception when others then code := sqlstate; end;
  insert into results values (6, 'a card from another set is rejected', '22023', code);
  select question into got from public.flashcards where id = c1;
  insert into results values (7, '...and nothing in the failed save stuck', 'Q1 edited', got);
  select question into got from public.flashcards where id = b1;
  insert into results values (8, '...and the other set''s card is untouched', 'QB', got);

  begin
    perform * from public.replace_set_cards(sa, a, jsonb_build_array(
      jsonb_build_object('id', c1, 'question', 'x', 'answer', 'x'),
      jsonb_build_object('id', c1, 'question', 'y', 'answer', 'y')
    ));
    code := 'ran';
  exception when others then code := sqlstate; end;
  insert into results values (9, 'the same card twice is rejected', '22023', code);

  perform * from public.replace_set_cards(sm, a, jsonb_build_array(
    jsonb_build_object('question', 'Which layer routes packets?', 'answer', 'Network',
                       'options', jsonb_build_array('Physical', 'Network', 'Transport', 'Session'))
  ));
  select jsonb_array_length(options) || ':' || answer into got from public.flashcards where set_id = sm;
  insert into results values (10, 'multiple choice keeps its 4 choices', '4:Network', got);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from public.replace_set_cards(sa, a, '[]'::jsonb); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (11, 'the owner calls it directly from the browser', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  begin perform * from public.replace_set_cards(sa, a, '[]'::jsonb); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (12, 'anon calls it', 'denied', case when ok then 'ALLOWED' else 'denied' end);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
