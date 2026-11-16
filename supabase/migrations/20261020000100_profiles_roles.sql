-- #51: user roles (student / teacher / admin).
--
-- Roles are changed only by server routes using the service-role key. Signed-in
-- users can read their own profile and edit their display_name, but never
-- their role: the column-level UPDATE grant below only covers display_name.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  -- Set when the user picks student/teacher at sign-up (#52). Null = not chosen yet.
  role_chosen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Privileges: anon gets nothing; authenticated can read and update display_name only.
-- Rows are only created by the trigger below and deleted with the auth user.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Create a profile for every new auth user. It must never block a sign-up: on
-- any error it logs a warning and lets the sign-up continue (the app treats a
-- user without a profile as a student, see lib/roles.ts).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user: could not create profile for %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill everyone who signed up before this migration as a student.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
on conflict (id) do nothing;
