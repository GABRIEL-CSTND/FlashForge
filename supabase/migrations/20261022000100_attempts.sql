-- #57: saved study results. One row each time a signed-in user finishes a
-- saved set. Written only by POST /api/attempts (service role), which works
-- out the score from the real cards; browsers can only read.
--
-- Who can read an attempt:
--   - the student who made it;
--   - the teacher of the class, only if the attempt was made from that class's
--     assignment AND the student is still in the class. Private study
--     (assignment_id null) is never visible to teachers, and leaving a class
--     hides the student's scores from that teacher.

create table if not exists public.attempts (
  -- Chosen by the browser for each finish, so a retried request can't create
  -- a second attempt.
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  -- Kept if the set is unassigned later; the attempt just becomes private.
  assignment_id uuid references public.assignments (id) on delete set null,
  study_type text not null check (study_type in ('flashcard', 'multiple_choice')),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  -- Per card: { cardId, chosen (multiple choice) | result (flashcards), correct }.
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists attempts_user_set_idx on public.attempts (user_id, set_id, completed_at desc);
create index if not exists attempts_assignment_idx on public.attempts (assignment_id);

alter table public.attempts enable row level security;

revoke all on table public.attempts from anon, authenticated;
grant select on table public.attempts to authenticated;

-- True if the signed-in user teaches the class of this assignment AND the
-- given student is still in that class.
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
    join public.class_members m on m.class_id = a.class_id
    where a.id = p_assignment_id
      and c.teacher_id = (select auth.uid())
      and m.student_id = p_student_id
  )
$$;

revoke all on function private.teaches_student_in_assignment(uuid, uuid) from public, anon;
grant execute on function private.teaches_student_in_assignment(uuid, uuid) to authenticated;

drop policy if exists "Students read their own attempts; teachers read their students' assignment attempts" on public.attempts;
create policy "Students read their own attempts; teachers read their students' assignment attempts"
  on public.attempts for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (assignment_id is not null and private.teaches_student_in_assignment(assignment_id, user_id))
  );
