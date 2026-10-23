-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/generation-logs-check.sql
-- Read-only in effect: everything is rolled back. Existing log rows are moved
-- out of the window first, so the numbers below only count this file's rows.
--
-- Days follow Pacific time (when the Gemini quota resets). Rows are placed at
-- 00:30 and 23:30 Pacific time "today", and 23:30 the day before, to check
-- that rows land on the right quota day.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; ok boolean; v bigint; t text; today date; midnight timestamptz;
begin
  select id into a from public.profiles where role = 'admin' order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  update public.generation_logs set created_at = now() - interval '200 days';
  today := (now() at time zone 'America/Los_Angeles')::date;
  midnight := today::timestamp at time zone 'America/Los_Angeles';

  insert into public.generation_logs (user_id, role, model, study_type, duration_ms, success, error_kind, requests, created_at) values
    (a, 'admin', 'gemini-3.5-flash', 'flashcard', 4000, true, null, '{"gemini-3.5-flash": 1}', midnight + interval '30 minutes'),
    (b, 'student', 'gemini-3.5-flash-lite', 'flashcard', 9000, true, null, '{"gemini-3.5-flash": 1, "gemini-3.5-flash-lite": 1}', midnight + interval '23 hours 30 minutes'),
    (b, 'student', null, 'multiple_choice', 30000, false, 'ai_busy', '{"gemini-3.5-flash": 1, "gemini-3.5-flash-lite": 2, "gemma-4-26b-a4b-it": 1}', midnight - interval '30 minutes'),
    (null, null, null, 'flashcard', 200, false, 'unreadable', '{}', midnight - interval '30 minutes');

  -- Browsers
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from public.generation_logs; ok := true; exception when others then ok := false; end;
  reset role; insert into results values (1, 'signed-in user (even an admin) reads generation_logs', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin insert into public.generation_logs (study_type, duration_ms, success) values ('flashcard', 1, true); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (2, 'signed-in user writes a log row', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform * from public.admin_generation_daily(14); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (3, 'signed-in user calls admin_generation_daily', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin perform count(*) from public.generation_logs; ok := true; exception when others then ok := false; end;
  reset role; insert into results values (4, 'anon reads generation_logs', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- Server: daily report by quota day
  select count(*) into v from public.admin_generation_daily(14);
  insert into results values (5, 'two quota days with activity', '2', v::text);
  select format('%s/%s/%s/%s', generations, failures, signed_out, avg_ms) into t from public.admin_generation_daily(14) where day = today;
  insert into results values (6, 'today: generations/failures/signed-out/avg ms', '2/0/0/6500', t);
  select answered::text into t from public.admin_generation_daily(14) where day = today;
  insert into results values (7, 'today: guides answered per model', '{"gemini-3.5-flash": 1, "gemini-3.5-flash-lite": 1}', t);
  select requests::text into t from public.admin_generation_daily(14) where day = today;
  insert into results values (8, 'today: requests per model (fallbacks count)', '{"gemini-3.5-flash": 2, "gemini-3.5-flash-lite": 1}', t);
  select format('%s/%s/%s', generations, failures, signed_out) || ' ' || requests::text into t
    from public.admin_generation_daily(14) where day = today - 1;
  insert into results values (9, 'yesterday (23:30 Pacific): 2 failed, 1 signed out', '2/2/1 {"gemini-3.5-flash": 1, "gemma-4-26b-a4b-it": 1, "gemini-3.5-flash-lite": 2}', t);
  select count(*) into v from public.admin_generation_daily(1);
  insert into results values (10, 'a 1-day window is just today', '1', v::text);

  -- Server: top users
  select format('%s %s %s/%s', (user_id = b), role, generations, failures) into t from public.admin_top_generators(14, 10) limit 1;
  insert into results values (11, 'top user first: B, 2 guides, 1 failed', 't student 2/1', t);
  select count(*) into v from public.admin_top_generators(14, 10);
  insert into results values (12, 'signed-out generations are not a "user"', '2', v::text);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
