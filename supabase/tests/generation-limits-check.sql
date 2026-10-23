-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/generation-limits-check.sql
-- Read-only in effect: everything is rolled back. Existing log rows are moved
-- out of today first, and the limits are set to known values.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; r jsonb; ok boolean; code text; v bigint; t text; i int;
begin
  select id into a from public.profiles where role = 'admin' order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  update public.generation_logs set created_at = now() - interval '200 days';
  update public.app_settings set value = '{"anonymous": 1, "student": 2, "teacher": 15, "admin": null}' where key = 'generation_limits';

  -- Browsers
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from public.app_settings; ok := true; exception when others then ok := false; end;
  reset role; insert into results values (1, 'signed-in user (even an admin) reads app_settings', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform public.start_generation(a, 'admin', null, 'flashcard'); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (2, 'signed-in user calls start_generation', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  execute 'set local role authenticated';
  begin perform public.admin_set_generation_limits(a, '{"anonymous": 9, "student": 9, "teacher": 9, "admin": null}'); ok := true; exception when others then ok := false; end;
  reset role; insert into results values (3, 'signed-in user calls admin_set_generation_limits', 'denied', case when ok then 'ALLOWED' else 'denied' end);
  perform set_config('request.jwt.claims', '{}', true);

  -- Student B, limit 2: two running reservations already count (parallel requests)
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (4, 'first request is allowed and reserved as running', 'true', (r->>'allowed'));
  select count(*) into v from public.generation_logs where id = (r->>'id')::bigint and success is null;
  insert into results values (5, 'the reserved row is running (success null)', '1', v::text);
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (6, 'second request (first still running) is allowed', 'true', (r->>'allowed'));
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (7, 'third request while two are running is refused', 'false 2', (r->>'allowed') || ' ' || (r->>'limit'));
  select count(*) into v from public.generation_logs where user_id = b and error_kind = 'limit';
  insert into results values (8, 'the refusal is logged as limit', '1', v::text);
  select ((r->>'resets_at')::timestamptz > now() and (r->>'resets_at')::timestamptz <= now() + interval '1 day')::text into t;
  insert into results values (9, 'resets_at is the next Pacific midnight (within a day)', 'true', t);

  -- Failures don't count, and a crashed (stale) reservation stops counting
  update public.generation_logs set success = false, error_kind = 'ai_busy' where user_id = b and success is null
    and id = (select min(id) from public.generation_logs where user_id = b and success is null);
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (10, 'after one failed, a request is allowed again', 'true', (r->>'allowed'));
  update public.generation_logs set created_at = now() - interval '5 minutes' where user_id = b and success is null;
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (11, 'running rows older than 2 minutes stop counting', 'true', (r->>'allowed'));
  update public.generation_logs set success = true where user_id = b and success is null;
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (12, 'with 3 guides done, refused', 'false', (r->>'allowed'));

  -- Signed out, limit 1, counted per IP hash
  r := public.start_generation(null, null, 'hash-1', 'flashcard');
  update public.generation_logs set success = true where id = (r->>'id')::bigint;
  r := public.start_generation(null, null, 'hash-1', 'flashcard');
  insert into results values (13, 'signed out: second guide from the same IP refused', 'false 1', (r->>'allowed') || ' ' || (r->>'limit'));
  r := public.start_generation(null, null, 'hash-2', 'flashcard');
  insert into results values (14, 'signed out: another IP is allowed', 'true', (r->>'allowed'));
  r := public.start_generation(a, 'admin', null, 'flashcard');
  insert into results values (15, 'admin limit null means no limit', 'true', r->>'allowed');

  -- Changing the limits
  begin perform public.admin_set_generation_limits(b, '{"anonymous": 1, "student": 9, "teacher": 15, "admin": null}'); ok := true; code := null;
  exception when others then ok := false; get stacked diagnostics code = returned_sqlstate; end;
  insert into results values (16, 'a non-admin sets limits', 'denied 42501', case when ok then 'ALLOWED' else 'denied ' || code end);
  i := 0;
  foreach t in array array['{"anonymous": 1, "student": 2, "teacher": 15}', '{"anonymous": -1, "student": 2, "teacher": 15, "admin": null}',
                           '{"anonymous": 1.5, "student": 2, "teacher": 15, "admin": null}', '{"anonymous": "2", "student": 2, "teacher": 15, "admin": null}',
                           '{"anonymous": 1, "student": 2, "teacher": 15, "owner": 1}', '[1, 2, 3, 4]'] loop
    begin perform public.admin_set_generation_limits(a, t::jsonb); exception when sqlstate '22023' then i := i + 1; end;
  end loop;
  insert into results values (17, 'missing, negative, fractional, text, unknown and non-object limits rejected', '6', i::text);
  perform public.admin_set_generation_limits(a, '{"anonymous": 1, "student": 9, "teacher": 15, "admin": null}');
  r := public.start_generation(b, 'student', null, 'flashcard');
  insert into results values (18, 'raising the student limit takes effect on the next request', 'true', r->>'allowed');
  select count(*) into v from public.audit_log where actor_id = a and action = 'settings_change' and target_id is null
    and details->'to'->>'student' = '9' and details->'from'->>'student' = '2';
  insert into results values (19, 'the change is in audit_log with from and to', '1', v::text);

  -- Dashboard leaves out running rows and refusals, and counts refusals
  select format('%s/%s', limited, generations) into t from public.admin_generation_daily(1);
  select count(*) into v from public.generation_logs where created_at >= private.quota_window_start(1) and success is not null and error_kind is distinct from 'limit';
  insert into results values (20, 'today: limited / finished generations', format('3/%s', v), t);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
