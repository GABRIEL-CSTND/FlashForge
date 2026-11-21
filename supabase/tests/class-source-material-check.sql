-- #116: who can read a set's source material through study_set_source()
-- (20261121000300). Holds with or without 20261121000310 (see
-- card-quotes-private-check.sql). Run against a database with the migrations
-- applied and two users. The fixtures are rolled back.
begin;

do $$
declare
  teacher uuid;
  student uuid;
  classroom uuid;
  target_set uuid;
  card uuid;
  class_item uuid;
  preview jsonb;
begin
  select id into teacher from auth.users order by id limit 1;
  select id into student from auth.users where id <> teacher order by id limit 1;
  if student is null then raise exception 'This check needs two users'; end if;

  insert into public.classes (teacher_id, name, join_code)
    values (teacher, 'Source material test', 'H7R8K9') returning id into classroom;
  insert into public.class_members (class_id, student_id) values (classroom, student);
  insert into public.flashcard_sets (user_id, title, study_type)
    values (teacher, 'Assessment source test', 'flashcard') returning id into target_set;
  insert into public.assignments (class_id, set_id, category)
    values (classroom, target_set, 'quiz') returning id into class_item;
  insert into public.guide_source_files (user_id, set_id, name, kind, content_base64)
    values (teacher, target_set, 'notes.txt', 'txt', 'aGVsbG8=');
  insert into public.flashcards (set_id, question, answer, source_excerpt, source_location, position)
    values (target_set, 'Question', 'Answer', 'Source text', 'Line 1', 0) returning id into card;

  perform set_config('request.jwt.claims', json_build_object('sub', teacher)::text, true);
  execute 'set local role authenticated';
  preview := public.study_set_source(target_set);
  if (preview ->> 'name') is distinct from 'notes.txt'
    or (preview #>> '{quotes,0,excerpt}') is distinct from 'Source text'
    or (preview #>> '{quotes,0,id}') is distinct from card::text then
    raise exception 'The set owner cannot read its source material';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', student)::text, true);
  execute 'set local role authenticated';
  if public.study_set_source(target_set, class_item) is not null or public.study_set_source(target_set, class_item, true) is not null then
    raise exception 'A student can read source material by default';
  end if;
  reset role;

  update public.assignments set allow_source_material = true where id = class_item;
  execute 'set local role authenticated';
  preview := public.study_set_source(target_set, class_item);
  if (preview ->> 'name') is distinct from 'notes.txt'
    or (preview #>> '{quotes,0,excerpt}') is distinct from 'Source text'
    or (public.study_set_source(target_set, class_item, true) ->> 'content_base64') is distinct from 'aGVsbG8=' then
    raise exception 'An enrolled student cannot read explicitly shared source material';
  end if;
  if public.study_set_source(target_set) is not null then raise exception 'The bare set URL grants access'; end if;
  if public.study_set_source(target_set, gen_random_uuid(), true) is not null then raise exception 'An unrelated class item grants access'; end if;
  reset role;

  update public.assignments set allow_source_material = false where id = class_item;
  execute 'set local role authenticated';
  if public.study_set_source(target_set, class_item, true) is not null then raise exception 'File access survived turning sharing off'; end if;
  reset role;
  update public.assignments set allow_source_material = true where id = class_item;

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  if public.study_set_source(target_set, class_item, true) is not null then raise exception 'A signed-out visitor can download the file'; end if;
  reset role;

  delete from public.class_members where class_id = classroom and student_id = student;
  perform set_config('request.jwt.claims', json_build_object('sub', student)::text, true);
  execute 'set local role authenticated';
  if public.study_set_source(target_set, class_item, true) is not null then raise exception 'A former member can download the file'; end if;
  reset role;
end $$;

select 'Class source material checks passed' as result;
rollback;
