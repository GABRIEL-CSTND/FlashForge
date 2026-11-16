-- #56: teachers assign their study sets to their classes, with an optional due
-- date. Students in the class can then read the set and its cards (only while
-- it's assigned); only the set's owner can edit it.
--
-- Writes go through server routes using the service-role key, which check the
-- caller owns both the set and the class (lib/assignments.ts). Browsers can
-- only read.

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  -- Null means no due date.
  due_at timestamptz,
  created_at timestamptz not null default now(),
  -- A set is assigned to a class at most once.
  unique (class_id, set_id)
);

create index if not exists assignments_set_id_idx on public.assignments (set_id);

alter table public.assignments enable row level security;

revoke all on table public.assignments from anon, authenticated;
grant select on table public.assignments to authenticated;

drop policy if exists "Class teachers and members read the class's assignments" on public.assignments;
create policy "Class teachers and members read the class's assignments"
  on public.assignments for select
  to authenticated
  using (private.is_class_teacher(class_id) or private.is_class_member(class_id));

-- True if the signed-in user is in a class this set is assigned to. Security
-- definer so the flashcard_sets policy can use it without RLS recursion.
create or replace function private.is_assigned_to_me(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.class_members m on m.class_id = a.class_id
    where a.set_id = p_set_id and m.student_id = (select auth.uid())
  )
$$;

revoke all on function private.is_assigned_to_me(uuid) from public, anon;
grant execute on function private.is_assigned_to_me(uuid) to authenticated;

-- Students read sets assigned to their classes (in addition to the existing
-- "owner or legacy ownerless" policy).
drop policy if exists "Class members read sets assigned to their class" on public.flashcard_sets;
create policy "Class members read sets assigned to their class"
  on public.flashcard_sets for select
  to authenticated
  using (private.is_assigned_to_me(id));

-- Cards follow their set: you can read a card exactly when you can read its
-- set. The subquery is itself filtered by flashcard_sets' policies (owner,
-- legacy ownerless, or assigned to your class), so access can't drift apart.
drop policy if exists "Cards are viewable if set is viewable" on public.flashcards;
create policy "Cards are viewable if set is viewable"
  on public.flashcards for select
  to public
  using (exists (select 1 from public.flashcard_sets s where s.id = flashcards.set_id));
