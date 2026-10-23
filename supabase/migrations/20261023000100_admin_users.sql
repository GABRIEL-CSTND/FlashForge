-- #60: admins see all users and change their roles; admin actions are logged.
--
-- audit_log is server-only: no grants or policies for browsers. Admins read it
-- through server routes. Rows stay when the actor's account is deleted.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('role_change', 'set_delete')),
  -- The user or set acted on. No foreign key: it may be deleted later.
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;

-- Every user with their role, sign-up date and number of saved sets, newest
-- first, optionally filtered by email or name. Service role only (it returns
-- emails).
create or replace function public.admin_list_users(p_search text default null, p_limit int default 100)
returns table (user_id uuid, email text, display_name text, role text, signed_up_at timestamptz, set_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.display_name, coalesce(p.role, 'student'), u.created_at,
         (select count(*) from public.flashcard_sets s where s.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p_search, '') = ''
     or u.email ilike '%' || p_search || '%'
     or p.display_name ilike '%' || p_search || '%'
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- Changes a user's role for an admin, in one transaction. It:
--   - checks the actor is an admin (the route checks too);
--   - locks every admin row first, so two admins demoting each other at the
--     same moment can't both succeed and leave no admin;
--   - refuses to demote the last admin;
--   - marks the role as chosen, so the sign-up chooser (#52) never offers a
--     demoted user "teacher" again;
--   - writes the change to audit_log.
-- Returns the previous role (unchanged and not logged if it's the same).
-- Errors: 42501 actor not an admin, P0002 no such user, P0001 'last_admin'.
create or replace function public.admin_change_role(p_actor_id uuid, p_user_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_role is null or p_role not in ('student', 'teacher', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  -- A user without a profile row counts as a student.
  insert into public.profiles (id) values (p_user_id) on conflict (id) do nothing;
  perform 1 from public.profiles where role = 'admin' for update;
  select role into v_old from public.profiles where id = p_user_id for update;
  if v_old = p_role then
    return v_old;
  end if;
  if v_old = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.profiles
    set role = p_role, role_chosen_at = coalesce(role_chosen_at, now())
    where id = p_user_id;
  insert into public.audit_log (actor_id, action, target_id, details)
    values (p_actor_id, 'role_change', p_user_id, jsonb_build_object('from', v_old, 'to', p_role));
  return v_old;
end;
$$;

revoke all on function public.admin_list_users(text, int) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, int) to service_role;
revoke all on function public.admin_change_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_change_role(uuid, uuid, text) to service_role;
