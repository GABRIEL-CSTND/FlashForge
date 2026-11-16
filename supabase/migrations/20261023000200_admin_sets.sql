-- #61: admins can open and delete any study set; deletions are logged.

-- True if the signed-in user is an admin. Security definer so policies can
-- use it without depending on profiles' own RLS.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Admins can read every set. Cards follow, since their policy checks the set
-- through the set's own RLS (#56).
drop policy if exists "Admins read every set" on public.flashcard_sets;
create policy "Admins read every set"
  on public.flashcard_sets for select
  to authenticated
  using (private.is_admin());

-- Every set with its owner and number of cards and assignments, newest
-- first, optionally filtered by title or owner email/name. Service role only
-- (it returns emails).
create or replace function public.admin_list_sets(p_search text default null, p_limit int default 200)
returns table (
  set_id uuid, title text, study_type text, created_at timestamptz,
  owner_id uuid, owner_email text, owner_name text, card_count bigint, assignment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.study_type, s.created_at, s.user_id, u.email::text, p.display_name,
         (select count(*) from public.flashcards f where f.set_id = s.id),
         (select count(*) from public.assignments a where a.set_id = s.id)
  from public.flashcard_sets s
  left join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  where coalesce(p_search, '') = ''
     or s.title ilike '%' || p_search || '%'
     or u.email ilike '%' || p_search || '%'
     or p.display_name ilike '%' || p_search || '%'
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

-- Deletes any set for an admin and logs it, in one transaction. Its cards,
-- assignments and saved results go with it (cascades). Returns how many
-- classes it was assigned to. Errors: 42501 actor not an admin, P0002 no set.
create or replace function public.admin_delete_set(p_actor_id uuid, p_set_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.flashcard_sets%rowtype;
  v_assignments integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  select * into v_set from public.flashcard_sets where id = p_set_id for update;
  if not found then
    raise exception 'set not found' using errcode = 'P0002';
  end if;
  select count(*) into v_assignments from public.assignments where set_id = p_set_id;
  insert into public.audit_log (actor_id, action, target_id, details)
    values (p_actor_id, 'set_delete', p_set_id, jsonb_build_object(
      'title', v_set.title, 'owner_id', v_set.user_id, 'study_type', v_set.study_type,
      'assignments', v_assignments));
  delete from public.flashcard_sets where id = p_set_id;
  return v_assignments;
end;
$$;

revoke all on function public.admin_list_sets(text, int) from public, anon, authenticated;
grant execute on function public.admin_list_sets(text, int) to service_role;
revoke all on function public.admin_delete_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_set(uuid, uuid) to service_role;
