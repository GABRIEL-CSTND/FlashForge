-- #53: classes with join codes, and class membership.
--
-- All writes go through server routes using the service-role key, which check
-- that the caller is the class's teacher (lib/classes.ts). There are no
-- INSERT/UPDATE/DELETE grants or policies for anon or authenticated.
-- Reads through RLS: a teacher sees their own classes and rosters; a student
-- sees the classes they joined and their own membership rows.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown
  -- to people as ABC-123. Unique so a code always points at one class.
  join_code text not null unique check (join_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  created_at timestamptz not null default now()
);

create index if not exists classes_teacher_id_idx on public.classes (teacher_id);

create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create index if not exists class_members_student_id_idx on public.class_members (student_id);

alter table public.classes enable row level security;
alter table public.class_members enable row level security;

revoke all on table public.classes from anon, authenticated;
revoke all on table public.class_members from anon, authenticated;
grant select on table public.classes to authenticated;
grant select on table public.class_members to authenticated;

-- Policy helpers. The classes policy needs to look at class_members and vice
-- versa, which would make RLS recurse; these SECURITY DEFINER functions read
-- the tables without RLS. They live in a schema the API doesn't expose.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.teacher_id = (select auth.uid())
  )
$$;

create or replace function private.is_class_member(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id and m.student_id = (select auth.uid())
  )
$$;

revoke all on function private.is_class_teacher(uuid) from public, anon;
revoke all on function private.is_class_member(uuid) from public, anon;
grant execute on function private.is_class_teacher(uuid) to authenticated;
grant execute on function private.is_class_member(uuid) to authenticated;

drop policy if exists "Teachers read their classes; members read classes they joined" on public.classes;
create policy "Teachers read their classes; members read classes they joined"
  on public.classes for select
  to authenticated
  using (teacher_id = (select auth.uid()) or private.is_class_member(id));

drop policy if exists "Students read their memberships; teachers read their rosters" on public.class_members;
create policy "Students read their memberships; teachers read their rosters"
  on public.class_members for select
  to authenticated
  using (student_id = (select auth.uid()) or private.is_class_teacher(class_id));

-- Roster with names and emails for a teacher's class page. Emails live in
-- auth.users, which the API can't read, so this runs as definer. Only the
-- service role may call it, and it returns nothing unless p_teacher_id is the
-- class's teacher.
create or replace function public.class_roster(p_class_id uuid, p_teacher_id uuid)
returns table (student_id uuid, display_name text, email text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.student_id, p.display_name, u.email::text, m.joined_at
  from public.class_members m
  join public.classes c on c.id = m.class_id and c.teacher_id = p_teacher_id
  join auth.users u on u.id = m.student_id
  left join public.profiles p on p.id = m.student_id
  where m.class_id = p_class_id
  order by lower(coalesce(p.display_name, u.email::text)), m.joined_at
$$;

revoke all on function public.class_roster(uuid, uuid) from public, anon, authenticated;
grant execute on function public.class_roster(uuid, uuid) to service_role;
