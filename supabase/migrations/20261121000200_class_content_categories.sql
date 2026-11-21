begin;

alter table public.assignments
  add column category text not null default 'assignment',
  add constraint assignments_category_check check (category in ('assignment', 'quiz', 'material')),
  add constraint assignments_material_due_check check (category <> 'material' or due_at is null);

-- Moving a graded set to learning materials hides its class scores while
-- keeping the attempts available to their students and for later reclassification.
create or replace function private.teaches_student_in_assignment(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    join public.class_members m on m.class_id = c.id
    where a.id = p_assignment_id
      and a.category <> 'material'
      and c.teacher_id = (select auth.uid())
      and m.student_id = p_student_id
  )
$$;

commit;
