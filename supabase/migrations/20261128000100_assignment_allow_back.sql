-- #102. Class assessments allow review unless the teacher turns it off.
alter table public.assignments
  add column if not exists allow_back boolean not null default true;
