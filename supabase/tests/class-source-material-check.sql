-- Run against a test database with the migrations applied and two users.
-- The fixtures are rolled back.
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
  -- A reorder preserves the quote even when the compatibility columns are empty.
  update public.flashcards set position = 1 where id = card;

  perform set_config('request.jwt.claims', json_build_object('sub', teacher)::text, true);
  execute 'set local role authenticated';
  preview := public.study_set_source(target_set);
  if (preview #>> '{quotes,0,excerpt}') is distinct from 'Source text' then
    raise exception 'The set owner lost the quote';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', student)::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.flashcards where id = card and source_excerpt is null and source_location is null) then
    raise exception 'The card is missing or raw source fields are visible';
  end if;
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

  update public.flashcards set answer = 'Rewritten answer' where id = card;
  execute 'set local role authenticated';
  if (public.study_set_source(target_set, class_item) -> 'quotes') is distinct from '[]'::jsonb then
    raise exception 'A rewritten card kept an outdated quote';
  end if;
  reset role;

  delete from public.class_members where class_id = classroom and student_id = student;
  execute 'set local role authenticated';
  if public.study_set_source(target_set, class_item, true) is not null then raise exception 'A former member can download the file'; end if;
  reset role;
end $$;

select 'Class source material checks passed' as result;
rollback;
