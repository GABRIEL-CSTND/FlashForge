-- Run against a test database with the migrations applied and three users.
-- All changes are rolled back.
begin;

-- Small room for this check: 10 bytes more than the check's teacher (the first
-- user) keeps, and 1000 more than everyone keeps. Lowered again below.
create temporary table check_class_room_base on commit drop as
  select
    (select coalesce(sum(f.size_bytes), 0) from public.class_files f
       join public.classes c on c.id = f.class_id
       where c.teacher_id = (select id from auth.users order by id limit 1))::bigint as teacher_used,
    (select coalesce(sum(size_bytes), 0) from public.class_files)::bigint as everyone_used;
create or replace function private.class_file_room(out per_teacher bigint, out everyone bigint)
language sql stable as $$
  select teacher_used + 10, everyone_used + 1000 from pg_temp.check_class_room_base
$$;

do $$
declare
  teacher uuid;
  student uuid;
  outsider uuid;
  classroom uuid;
  other_class uuid;
  file_id uuid;
  deleted integer;
  full_hint text;
begin
  select id into teacher from auth.users order by id limit 1;
  select id into student from auth.users order by id offset 1 limit 1;
  select id into outsider from auth.users order by id offset 2 limit 1;
  if outsider is null then raise exception 'This check needs three users'; end if;
  if has_table_privilege('anon', 'public.class_files', 'SELECT') then
    raise exception 'Signed-out users have file access';
  end if;

  update public.profiles set role = 'teacher' where id in (teacher, outsider);
  insert into public.classes (teacher_id, name, join_code)
    values (teacher, 'Class file test', 'F4K6R7') returning id into classroom;
  insert into public.class_members (class_id, student_id) values (classroom, student);

  perform set_config('request.jwt.claims', json_build_object('sub', teacher)::text, true);
  execute 'set local role authenticated';
  insert into public.class_files (class_id, name, content_base64)
    values (classroom, 'Lesson notes.txt', 'aGVsbG8=') returning id into file_id;
  if (select size_bytes from public.class_files where id = file_id) is distinct from 5 then
    raise exception 'Stored file size does not match the bytes';
  end if;
  begin
    insert into public.class_files (class_id, name, content_base64) values (classroom, 'page.html', 'aGVsbG8=');
    raise exception 'Unsupported file type was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.class_files (class_id, name, content_base64)
      values (classroom, 'Too large.pdf', repeat('A', 5592408));
    raise exception 'A file larger than 4 MB was accepted';
  exception when check_violation then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', student)::text, true);
  execute 'set local role authenticated';
  if (select content_base64 from public.class_files where id = file_id) is distinct from 'aGVsbG8=' then
    raise exception 'Enrolled student cannot download the file';
  end if;
  begin
    insert into public.class_files (class_id, name, content_base64) values (classroom, 'student.txt', 'aGVsbG8=');
    raise exception 'Student can post files';
  exception when insufficient_privilege then null;
  end;
  delete from public.class_files where id = file_id;
  get diagnostics deleted = row_count;
  if deleted <> 0 then raise exception 'Student can remove files'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.class_files where id = file_id) then
    raise exception 'Another teacher can read the file';
  end if;
  begin
    insert into public.class_files (class_id, name, content_base64) values (classroom, 'outside.txt', 'aGVsbG8=');
    raise exception 'Another teacher can post files';
  exception when insufficient_privilege then null;
  end;
  reset role;

  delete from public.class_members where class_id = classroom and student_id = student;
  perform set_config('request.jwt.claims', json_build_object('sub', student)::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.class_files where id = file_id) then raise exception 'A former member can read the file'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', teacher)::text, true);
  execute 'set local role authenticated';
  delete from public.class_files where id = file_id;
  get diagnostics deleted = row_count;
  if deleted <> 1 then raise exception 'Class teacher cannot remove the file'; end if;
  insert into public.class_files (class_id, name, content_base64)
    values (classroom, 'Second file.txt', 'aGVsbG8=') returning id into file_id;

  -- The teacher's room: 5 of 10 bytes are taken, so 6 more don't fit and 5 do.
  begin
    insert into public.class_files (class_id, name, content_base64) values (classroom, 'Six bytes.txt', 'c2l4c2l4');
    raise exception 'A file past the teacher''s room was posted';
  exception when sqlstate 'PT413' then
    get stacked diagnostics full_hint = pg_exception_hint;
    if full_hint is distinct from 'teacher' then raise exception 'The teacher''s full room said %', full_hint; end if;
  end;
  insert into public.class_files (class_id, name, content_base64) values (classroom, 'Five bytes.txt', 'aGVsbG8=');
  reset role;

  -- Everyone's room, lowered to 12 bytes more than before the check: this
  -- teacher keeps 10, so another teacher's 5 don't fit.
  create or replace function private.class_file_room(out per_teacher bigint, out everyone bigint)
  language sql stable as $room$ select 1000000::bigint, everyone_used + 12 from pg_temp.check_class_room_base $room$;
  insert into public.classes (teacher_id, name, join_code)
    values (outsider, 'Class file room test', 'F4K6R8') returning id into other_class;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.class_files (class_id, name, content_base64) values (other_class, 'Five.txt', 'aGVsbG8=');
    raise exception 'A file past everyone''s room was posted';
  exception when sqlstate 'PT413' then
    get stacked diagnostics full_hint = pg_exception_hint;
    if full_hint is distinct from 'everyone' then raise exception 'Everyone''s full room said %', full_hint; end if;
  end;
  reset role;

  delete from public.classes where id = classroom;
  if exists (select 1 from public.class_files where id = file_id) then raise exception 'Class deletion left a file behind'; end if;
end $$;

select 'Class file post checks passed' as result;
rollback;
