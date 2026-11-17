-- #102: Option for teachers to disallow going back on cards during an exam/assignment.
-- When false, students cannot return to previous cards or questions while taking the assignment.
alter table public.assignments
  add column if not exists allow_back boolean not null default true;
