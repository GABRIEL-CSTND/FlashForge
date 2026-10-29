-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/history-rls-check.sql
-- Read-only in effect: the test data is rolled back.
--
-- Checks public.guide_history (History). Users A and B are two existing
-- accounts (roles don't matter for RLS).
--   A: entries h1 (3 cards, saved as set S) and h2; B: entry h3.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
grant all on results to service_role;
do $$
declare
  a uuid; b uuid; s uuid; h1 uuid; h2 uuid; h3 uuid;
  v bigint; ok boolean; code text; got text;
  cards jsonb := '[{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}, {"question": "Q3", "answer": "A3"}]';
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'history test S', 'flashcard') returning id into s;

  -- The server adds entries with the service-role key, like /api/generate.
  execute 'set local role service_role';
  begin
    insert into public.guide_history (user_id, title, study_type, source_filename, items, set_id)
      values (a, 'history test 1', 'flashcard', 'bio.pdf', cards, s) returning id into h1;
    insert into public.guide_history (user_id, title, study_type, source_filename, source_credit, items)
      values (a, 'history test 2', 'multiple_choice', 'https://en.wikipedia.org/wiki/Cell',
              '{"name": "Wikipedia: Cell", "url": "https://en.wikipedia.org/wiki/Cell"}',
              '[{"question": "Q", "answer": "A", "options": ["A", "B", "C", "D"]}]') returning id into h2;
    insert into public.guide_history (user_id, title, study_type, items)
      values (b, 'history test 3', 'true_false', '[{"question": "Q", "answer": "True", "options": ["True", "False"]}]')
      returning id into h3;
    code := 'inserted';
  exception when others then code := sqlstate; end;
  reset role; insert into results values (1, 'the server adds entries', 'inserted', code);

  select item_count into v from public.guide_history where id = h1;
  insert into results values (2, 'item_count is the number of cards', '3', v::text);
  begin insert into public.guide_history (user_id, title, study_type, items) values (a, 'x', 'flashcard', '[]'); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (3, 'an entry with no cards', '23514', code);
  begin insert into public.guide_history (user_id, title, study_type, items) values (a, 'x', 'flashcard', '{"question": "Q"}'); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (4, 'cards that aren''t a list', '23514', code);
  begin insert into public.guide_history (user_id, title, study_type, items) values (a, 'x', 'essay', cards); code := 'inserted';
  exception when others then code := sqlstate; end;
  insert into results values (5, 'an unknown study type', '23514', code);

  -- A: the owner
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.guide_history where id in (h1, h2, h3);
  reset role; insert into results values (6, 'A reads only their own entries', '2', v::text);
  execute 'set local role authenticated';
  begin insert into public.guide_history (user_id, title, study_type, items) values (a, 'planted', 'flashcard', cards); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (7, 'A adds an entry directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin update public.guide_history set set_id = null where id = h1; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (8, 'A edits their own entry directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- B: someone else
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.guide_history where id in (h1, h2);
  reset role; insert into results values (9, 'B reads A''s entries', '0', v::text);
  execute 'set local role authenticated';
  delete from public.guide_history where id = h1;
  get diagnostics v = row_count;
  reset role; insert into results values (10, 'B removes A''s entry', '0 rows', v || ' rows');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.guide_history where id = h2;
  get diagnostics v = row_count;
  reset role; insert into results values (11, 'A removes their own entry', '1 rows', v || ' rows');

  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  begin select count(*) into v from public.guide_history; ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (12, 'anon reads history', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- Deleting the saved set keeps the entry, as not saved.
  delete from public.flashcard_sets where id = s;
  select count(*) filter (where set_id is null) || '/' || count(*) into got from public.guide_history where id = h1;
  insert into results values (13, 'deleting the saved set keeps the entry, not saved', '1/1', got);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
