-- #54: wrong join-code attempts, so POST /api/student/classes can rate-limit
-- guessing (see lib/student-classes.ts). Stored in the database because the
-- app runs on many serverless instances that don't share memory.
--
-- Only the service role (server routes) reads or writes this table: no grants
-- or policies for anon or authenticated.

create table if not exists public.class_join_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists class_join_failures_user_time_idx
  on public.class_join_failures (user_id, attempted_at desc);

alter table public.class_join_failures enable row level security;

revoke all on table public.class_join_failures from anon, authenticated;
