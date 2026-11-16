-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/admin-sets-check.sql
-- Read-only in effect: everything is rolled back.
--
-- Setup: A is an existing admin; B and C are two other existing accounts,
-- made plain students here. B owns private set S (2 cards), assigned to C's
-- class X, with one saved result.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; c uuid; s uuid; x uuid; v bigint; ok boolean; code text; n int;
begin
  select id into a from public.profiles where role = 'admin' order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;
  update public.profiles set role = 'student' where id in (b, c);

  insert into public.flashcard_sets (user_id, title, study_type) values (b, 'admin sets test S', 'flashcard') returning id into s;
  insert into public.flashcards (set_id, question, answer, position) values (s, 'Q1', 'A1', 0), (s, 'Q2', 'A2', 1);
  insert into public.classes (teacher_id, name, join_code) values (c, 'admin sets test X', 'ADMSTX') returning id into x;
  insert into public.assignments (class_id, set_id) values (x, s);
  insert into public.attempts (id, user_id, set_id, study_type, score, total) values (gen_random_uuid(), c, s, 'flashcard', 1, 2);

  -- Reading through RLS
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcard_sets where id = s;
  reset role; insert into results values (1, 'admin opens another user''s private set', '1', v::text);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = s;
  reset role; insert into results values (2, 'admin reads its cards', '2', v::text);
  execute 'set local role authenticated';
  begin delete from public.flashcard_sets where id = s; get diagnostics n = row_count; ok := n > 0;
  exception when others then ok := false; end;
  reset role; insert into results values (3, 'admin deletes it directly (must use the server)', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcard_sets where user_id = b and id <> s;
  reset role; insert into results values (4, 'a student reads someone else''s unassigned sets', '0', v::text);
  execute 'set local role authenticated';
  begin perform * from public.admin_list_sets(null, 10); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (5, 'signed-in user calls admin_list_sets', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform public.admin_delete_set(a, s); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (6, 'signed-in user calls admin_delete_set', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into v from public.flashcard_sets where id = s;
  reset role; insert into results values (7, 'anon reads the private set', '0', v::text);

  -- Server (service role)
  select assignment_count into v from public.admin_list_sets('admin sets test S', 10) where set_id = s;
  insert into results values (8, 'admin_list_sets finds it by title, with its assignments', '1', v::text);
  select card_count into v from public.admin_list_sets(null, 500) where set_id = s;
  insert into results values (9, 'admin_list_sets counts its cards', '2', v::text);

  begin perform public.admin_delete_set(b, s); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (10, 'a non-admin (the owner) deletes through admin_delete_set', 'denied 42501', case when ok then 'ALLOWED' else 'denied ' || code end);

  n := public.admin_delete_set(a, s);
  insert into results values (11, 'admin deletes it (returns classes it was assigned to)', '1', n::text);
  select count(*) into v from public.flashcard_sets where id = s;
  insert into results values (12, 'the set is gone', '0', v::text);
  select (select count(*) from public.flashcards where set_id = s) + (select count(*) from public.assignments where set_id = s)
       + (select count(*) from public.attempts where set_id = s) into v;
  insert into results values (13, 'its cards, assignment and results went with it', '0', v::text);
  select count(*) into v from public.audit_log where actor_id = a and action = 'set_delete' and target_id = s
    and details->>'title' = 'admin sets test S' and (details->>'owner_id')::uuid = b and (details->>'assignments')::int = 1;
  insert into results values (14, 'the deletion is in audit_log (who, which set, title, owner)', '1', v::text);

  begin perform public.admin_delete_set(a, s); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (15, 'deleting it again', 'denied P0002', case when ok then 'ALLOWED' else 'denied ' || code end);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
