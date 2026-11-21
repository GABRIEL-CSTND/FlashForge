-- #111: a guide's file is private to its owner, kept once for the guide's History
-- entry and the set it's saved as, and limited in size (20261121000100,
-- 20261121000110). Run against a database with both migrations applied and two
-- users who keep no files yet. Everything is rolled back.
begin;

-- Small limits for this check: 10 bytes a user, and 1000 more for everyone
-- than they already keep. Lowered again below.
create temporary table check_room_base on commit drop as
  select coalesce(sum(size_bytes), 0)::bigint as used from public.guide_source_files;
create or replace function private.source_file_room(out per_user bigint, out everyone bigint)
language sql stable as $$ select 10::bigint, (select used + 1000 from pg_temp.check_room_base) $$;

do $$
declare
  owner_id uuid;
  other_id uuid;
  first_guide uuid;
  saved_set uuid;
  other_set uuid;
  file_id uuid;
  newer_guide uuid;
  newest_guide uuid;
  extra_guide uuid;
begin
  select id into owner_id from auth.users u
    where not exists (select 1 from public.guide_source_files f where f.user_id = u.id) order by id limit 1;
  select id into other_id from auth.users u
    where u.id <> owner_id and not exists (select 1 from public.guide_source_files f where f.user_id = u.id)
    order by id limit 1;
  if other_id is null then raise exception 'This check needs two users who keep no files'; end if;

  execute 'set local role service_role';
  insert into public.guide_history (user_id, title, study_type, items, created_at)
    values (owner_id, 'Source test', 'flashcard', '[{"question":"Q","answer":"A"}]', now() - interval '3 minutes')
    returning id into first_guide;
  insert into public.flashcard_sets (user_id, title, study_type)
    values (owner_id, 'Saved source test', 'flashcard') returning id into saved_set;
  insert into public.flashcard_sets (user_id, title, study_type)
    values (other_id, 'Other source test', 'flashcard') returning id into other_set;
  -- "hello": 5 bytes.
  insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
    values (owner_id, first_guide, 'notes.txt', 'txt', 'aGVsbG8=') returning id into file_id;
  if (select size_bytes from public.guide_source_files where id = file_id) is distinct from 5 then
    raise exception 'The file''s size is wrong';
  end if;

  update public.guide_history set set_id = other_set where id = first_guide;
  if exists (select 1 from public.guide_source_files where set_id = other_set) then
    raise exception 'A file was given to a set owned by someone else';
  end if;
  update public.guide_history set set_id = saved_set where id = first_guide;
  if (select count(*) from public.guide_source_files where user_id = owner_id) <> 1
    or not exists (select 1 from public.guide_source_files where id = file_id and history_id = first_guide and set_id = saved_set) then
    raise exception 'Saving the guide copied its file instead of sharing it';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', other_id)::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.guide_source_files where id = file_id) then
    raise exception 'Another account can read a private source';
  end if;
  reset role;

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  if exists (select 1 from public.guide_source_files where id = file_id) then
    raise exception 'A signed-out visitor can read a private source';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.guide_source_files where history_id = first_guide or set_id = saved_set) <> 1 then
    raise exception 'The owner cannot read their source';
  end if;
  reset role;

  -- The owner's 10 bytes: the saved file takes 5.
  execute 'set local role service_role';
  insert into public.guide_history (user_id, title, study_type, items, created_at)
    values (owner_id, 'Newer', 'flashcard', '[{"question":"Q","answer":"A"}]', now() - interval '2 minutes') returning id into newer_guide;
  insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
    values (owner_id, newer_guide, 'hi.txt', 'txt', 'aGk=');
  insert into public.guide_history (user_id, title, study_type, items, created_at)
    values (owner_id, 'Newest', 'flashcard', '[{"question":"Q","answer":"A"}]', now() - interval '1 minute') returning id into newest_guide;
  -- 5 + 2 + 5 is too much: the oldest unsaved file makes room, the saved one stays.
  insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
    values (owner_id, newest_guide, 'hello.txt', 'txt', 'aGVsbG8=');
  if exists (select 1 from public.guide_source_files where history_id = newer_guide)
    or not exists (select 1 from public.guide_source_files where history_id = newest_guide)
    or not exists (select 1 from public.guide_source_files where id = file_id) then
    raise exception 'Room was not made from the oldest unsaved file';
  end if;
  -- 6 bytes can't fit beside the saved 5: refused, and nothing is removed for it.
  insert into public.guide_history (user_id, title, study_type, items)
    values (owner_id, 'Extra', 'flashcard', '[{"question":"Q","answer":"A"}]') returning id into extra_guide;
  begin
    insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
      values (owner_id, extra_guide, 'six.txt', 'txt', 'c2l4c2l4');
    raise exception 'A file that does not fit was kept';
  exception when sqlstate 'PT413' then null;
  end;
  if not exists (select 1 from public.guide_source_files where history_id = newest_guide) then
    raise exception 'A refused file still removed another';
  end if;
  reset role;

  -- Everyone's room, lowered to 12 bytes more than before the check: the owner
  -- keeps 10, so the other user's 5 don't fit.
  create or replace function private.source_file_room(out per_user bigint, out everyone bigint)
  language sql stable as $room$ select 100::bigint, (select used + 12 from pg_temp.check_room_base) $room$;
  execute 'set local role service_role';
  insert into public.guide_history (user_id, title, study_type, items)
    values (other_id, 'Other guide', 'flashcard', '[{"question":"Q","answer":"A"}]') returning id into extra_guide;
  begin
    insert into public.guide_source_files (user_id, history_id, name, kind, content_base64)
      values (other_id, extra_guide, 'hello.txt', 'txt', 'aGVsbG8=');
    raise exception 'A file was kept past the room for everyone';
  exception when sqlstate 'PT413' then null;
  end;
  reset role;

  -- Deleting the History entry leaves the file with the set; deleting the set
  -- then removes it.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  execute 'set local role authenticated';
  delete from public.guide_history where id = first_guide;
  reset role;
  if not exists (select 1 from public.guide_source_files where id = file_id and history_id is null and set_id = saved_set) then
    raise exception 'Deleting the History entry removed the saved set''s file';
  end if;
  execute 'set local role authenticated';
  delete from public.flashcard_sets where id = saved_set;
  reset role;
  if exists (select 1 from public.guide_source_files where id = file_id) then
    raise exception 'Deleting the set left its file behind';
  end if;

  -- Deleting the set first leaves the file with the History entry.
  execute 'set local role service_role';
  insert into public.flashcard_sets (user_id, title, study_type)
    values (owner_id, 'Second saved test', 'flashcard') returning id into saved_set;
  update public.guide_history set set_id = saved_set where id = newest_guide;
  reset role;
  execute 'set local role authenticated';
  delete from public.flashcard_sets where id = saved_set;
  reset role;
  if not exists (select 1 from public.guide_source_files where history_id = newest_guide and set_id is null) then
    raise exception 'Deleting the set removed its History entry''s file';
  end if;
  execute 'set local role authenticated';
  delete from public.guide_history where id = newest_guide;
  reset role;
  if exists (select 1 from public.guide_source_files where user_id = owner_id) then
    raise exception 'Deleting the History entry left its file behind';
  end if;
end $$;

select 'Guide source file checks passed' as result;
rollback;
