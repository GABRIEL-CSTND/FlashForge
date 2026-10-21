-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/sets-rls-check.sql
-- Read-only in effect: everything runs inside a transaction that is rolled back.
-- Simulates anon / user A (owns sets) / user B (different user). Always rolled back.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; b uuid; a_set uuid; owned uuid[]; v bigint; ok boolean;
  procedure_as text;
begin
  select s.user_id, s.id into a, a_set from public.flashcard_sets s
    where s.user_id is not null and exists (select 1 from public.flashcards f where f.set_id = s.id) limit 1;
  select id into b from auth.users where id <> a limit 1;
  select array_agg(id) into owned from public.flashcard_sets where user_id is not null;

  -- 1-3: anonymous visitor
  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  select count(*) into v from public.flashcards where set_id = any(owned);
  reset role; insert into results values (1, 'anon reads cards of owned (private) sets', '0', v::text);
  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  select count(*) into v from public.flashcard_sets where user_id is not null;
  reset role; insert into results values (2, 'anon reads owned sets', '0', v::text);
  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  begin
    insert into public.flashcard_sets (title, study_type) values ('rls-test', 'flashcard'); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (3, 'anon inserts a set directly', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- 4-8: user B (not the owner)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  with d as (delete from public.flashcard_sets where id = a_set returning 1) select count(*) into v from d;
  reset role; insert into results values (4, 'user B deletes A''s set', '0 rows', v || ' rows');
  execute 'set local role authenticated';
  with u as (update public.flashcard_sets set title = 'hacked' where id = a_set returning 1) select count(*) into v from u;
  reset role; insert into results values (5, 'user B renames A''s set', '0 rows', v || ' rows');
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = a_set;
  reset role; insert into results values (6, 'user B reads A''s cards', '0', v::text);
  execute 'set local role authenticated';
  begin
    insert into public.flashcard_sets (title, study_type, user_id) values ('planted', 'flashcard', a); ok := true;
  exception when others then ok := false; end;
  reset role; insert into results values (7, 'user B plants a set in A''s account', 'denied', case when ok then 'ALLOWED' else 'denied' end);

  -- 8-10: user A (the owner)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v from public.flashcards where set_id = a_set;
  reset role; insert into results values (8, 'owner reads own cards', '>0', v::text);
  execute 'set local role authenticated';
  with u as (update public.flashcard_sets set title = title where id = a_set returning 1) select count(*) into v from u;
  reset role; insert into results values (9, 'owner renames own set', '1 rows', v || ' rows');
  perform set_config('request.jwt.claims', '{}', true); -- anon has no sign-in
  execute 'set local role anon';
  select count(*) into v from public.flashcard_sets where user_id is null;
  reset role; insert into results values (10, 'anon reads ownerless (legacy) sets', '>0 (allowed)', v::text);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
