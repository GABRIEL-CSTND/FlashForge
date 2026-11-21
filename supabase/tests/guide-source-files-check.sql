-- Run against a local or test database with the migrations applied and two users.
-- All fixture changes are rolled back.
begin;

do $$
declare
  owner_id uuid;
  other_id uuid;
  guide_id uuid;
  saved_id uuid;
  other_set_id uuid;
  cards jsonb := '[{"question":"Q","answer":"A"}]';
begin
  select id into owner_id from auth.users order by id limit 1;
  select id into other_id from auth.users where id <> owner_id order by id limit 1;
  if other_id is null then raise exception 'This check needs two users'; end if;

  execute 'set local role service_role';
  insert into public.guide_history (user_id, title, study_type, items)
    values (owner_id, 'Source test', 'flashcard', cards) returning id into guide_id;
  insert into public.flashcard_sets (user_id, title, study_type)
    values (owner_id, 'Saved source test', 'flashcard') returning id into saved_id;
  insert into public.flashcard_sets (user_id, title, study_type)
    values (other_id, 'Other source test', 'flashcard') returning id into other_set_id;
  insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
    values (owner_id, guide_id, 'notes.txt', 'txt', 'aGVsbG8=');
  update public.guide_history set set_id = other_set_id where id = guide_id;
  if exists (select 1 from public.guide_source_files where set_id = other_set_id) then
    raise exception 'Source file was linked to a set owned by someone else';
  end if;
  update public.guide_history set set_id = saved_id where id = guide_id;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', other_id)::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.guide_source_files where history_id = guide_id or set_id = saved_id) then
    raise exception 'Another account can read a private source';
  end if;
  reset role;

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  if exists (select 1 from public.guide_source_files where history_id = guide_id or set_id = saved_id) then
    raise exception 'Signed-out user can read a private source';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.guide_source_files
      where (history_id = guide_id or set_id = saved_id) and content_base64 = 'aGVsbG8=') <> 2 then
    raise exception 'The owner cannot read both copies of the same source';
  end if;
  delete from public.guide_history where id = guide_id;
  if exists (select 1 from public.guide_source_files where history_id = guide_id)
    or not exists (select 1 from public.guide_source_files where set_id = saved_id) then
    raise exception 'Deleting History did not remove exactly its own copy';
  end if;
  delete from public.flashcard_sets where id = saved_id;
  if exists (select 1 from public.guide_source_files where set_id = saved_id) then
    raise exception 'Deleting the set did not remove its source';
  end if;
  reset role;
end $$;

select 'Guide source file checks passed' as result;
rollback;
