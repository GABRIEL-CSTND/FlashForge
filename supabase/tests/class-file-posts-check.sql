-- Run against a test database with the migrations applied and three users.
-- All changes are rolled back.
begin;

do $$
declare
  teacher uuid;
  student uuid;
  outsider uuid;
  classroom uuid;
  file_id uuid;
  deleted integer;
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
  reset role;

  delete from public.classes where id = classroom;
  if exists (select 1 from public.class_files where id = file_id) then raise exception 'Class deletion left a file behind'; end if;
end $$;

select 'Class file post checks passed' as result;
rollback;
