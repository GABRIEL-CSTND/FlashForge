-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/server-only-card-writes-check.sql
-- Read-only in effect: the test data is rolled back.
--
-- Checks the grants on public.flashcards and public.flashcard_sets
-- (20261112000100_server_only_card_writes.sql and 20261112000200_tighten_set_grants.sql):
-- cards and new sets are written only by the server (service role), and a signed-in
-- owner can still read, rename and delete their own sets, and nothing else.
-- Cases 1-5 read the grants; 6-10 act as owner A on a test set.
begin;
create temp table results (n int, check_name text, expected text, actual text) on commit drop;
do $$
declare
  a uuid; s uuid; c uuid; v bigint; got text;
begin
  -- 1-5: the grants. has_any_column_privilege, so a column-level grant counts too.
  select coalesce(string_agg(r || ' ' || p, ', ' order by r, p), 'none') into got
  from unnest(array['anon', 'authenticated']) as r
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) as p
  where case when p in ('INSERT', 'UPDATE') then has_any_column_privilege(r, 'public.flashcards', p)
             else has_table_privilege(r, 'public.flashcards', p) end;
  insert into results values (1, 'browsers have no write grants on flashcards', 'none', got);

  select coalesce(string_agg(r || ' ' || p, ', ' order by r, p), 'none') into got
  from unnest(array['anon', 'authenticated']) as r
  cross join unnest(array['INSERT', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) as p
  where case when p = 'INSERT' then has_any_column_privilege(r, 'public.flashcard_sets', p)
             else has_table_privilege(r, 'public.flashcard_sets', p) end;
  insert into results values (2, 'browsers can''t insert or truncate flashcard_sets', 'none', got);

  select coalesce(string_agg(p, ', ' order by p), 'none') into got
  from unnest(array['UPDATE', 'DELETE']) as p
  where case when p = 'UPDATE' then has_any_column_privilege('anon', 'public.flashcard_sets', p)
             else has_table_privilege('anon', 'public.flashcard_sets', p) end;
  insert into results values (3, 'anon can''t update or delete flashcard_sets', 'none', got);

  select coalesce(string_agg(attname::text, ', ' order by attname), 'none') into got
  from pg_attribute
  where attrelid = 'public.flashcard_sets'::regclass and attnum > 0 and not attisdropped
    and has_column_privilege('authenticated', 'public.flashcard_sets', attname, 'UPDATE');
  insert into results values (4, 'signed-in users can update only a set''s title', 'title', got);

  got := coalesce(nullif(concat_ws(', ',
    case when not has_table_privilege('authenticated', 'public.flashcard_sets', 'SELECT') then 'no SELECT on sets' end,
    case when not has_table_privilege('authenticated', 'public.flashcards', 'SELECT') then 'no SELECT on cards' end,
    case when not has_table_privilege('authenticated', 'public.flashcard_sets', 'DELETE') then 'no DELETE on sets' end), ''), 'all kept');
  insert into results values (5, 'signed-in users still read sets and cards and delete sets', 'all kept', got);

  -- 6-10: owner A, on a set made here as the server would.
  select id into a from auth.users order by created_at limit 1;
  insert into public.flashcard_sets (user_id, title, study_type) values (a, 'grants test S', 'flashcard') returning id into s;
  insert into public.flashcards (set_id, question, answer, position) values (s, 'Q1', 'A1', 0) returning id into c;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  with u as (update public.flashcard_sets set title = 'grants test renamed' where id = s returning 1) select count(*) into v from u;
  reset role; insert into results values (6, 'owner renames own set', '1 rows', v || ' rows');

  execute 'set local role authenticated';
  begin update public.flashcard_sets set study_type = 'multiple_choice' where id = s; got := 'ALLOWED';
  exception when others then got := sqlstate; end;
  reset role; insert into results values (7, 'owner changes own set''s study type', '42501', got);

  execute 'set local role authenticated';
  begin insert into public.flashcards (set_id, question, answer, position) values (s, 'Q2', 'A2', 1); got := 'ALLOWED';
  exception when others then got := sqlstate; end;
  reset role; insert into results values (8, 'owner adds a card to own set', '42501', got);

  execute 'set local role authenticated';
  begin update public.flashcards set answer = 'changed' where id = c; got := 'ALLOWED';
  exception when others then got := sqlstate; end;
  reset role; insert into results values (9, 'owner edits a card directly', '42501', got);

  execute 'set local role authenticated';
  with d as (delete from public.flashcard_sets where id = s returning 1) select count(*) into v from d;
  reset role;
  select v || ' rows, ' || count(*) || ' cards left' into got from public.flashcards where set_id = s;
  insert into results values (10, 'owner deletes own set, and its cards go with it', '1 rows, 0 cards left', got);
end $$;
select n, check_name, expected, actual from results order by n;
rollback;
