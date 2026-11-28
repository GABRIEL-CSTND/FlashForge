-- #131: remove legacy/orphaned study sets that have no owner, require every
-- study set to have a valid owner going forward, and scope set visibility
-- strictly to the owner, students in classes the set is assigned to, and admins.

begin;

-- 1. Permanently delete orphaned/ownerless study sets (where user_id is null or
--    points to a non-existent auth.users row). Foreign keys on flashcards,
--    assignments, attempts, and private.card_source_quotes cascade automatically;
--    guide_history and guide_source_files unlink via ON DELETE SET NULL.
delete from public.flashcard_sets s
where s.user_id is null
   or not exists (
     select 1 from auth.users u where u.id = s.user_id
   );

-- 2. Enforce a strict non-nullable owner constraint on flashcard_sets going forward.
alter table public.flashcard_sets
  alter column user_id set not null;

-- 3. Replace the legacy "Sets are viewable by owner or anon-created" policy with
--    a strict owner-only policy for authenticated users. Class members and admins
--    continue to read through their dedicated policies ("Class members read sets
--    assigned to their class" and "Admins read every set"), and flashcards follow
--    flashcard_sets RLS automatically.
drop policy if exists "Sets are viewable by owner or anon-created" on public.flashcard_sets;
drop policy if exists "Sets are viewable by owner" on public.flashcard_sets;
create policy "Sets are viewable by owner"
  on public.flashcard_sets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 4. Update study_set_source() to remove the ownerless set branch
--    `or (s.user_id is null and not p_include_file)`. Handles both the
--    pre-20261121000310 schema (quotes on flashcards) and post-20261121000310
--    schema (quotes in private.card_source_quotes).
do $$
begin
  if to_regclass('private.card_source_quotes') is not null then
    execute $fn$
      create or replace function public.study_set_source(
        p_set_id uuid,
        p_class_item_id uuid default null,
        p_include_file boolean default false
      )
      returns jsonb
      language sql stable security definer set search_path = '' as $body$
        select case when p_include_file then (
          select jsonb_build_object('kind', f.kind, 'content_base64', f.content_base64)
          from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id
        ) else jsonb_build_object(
          'name', (select f.name from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id),
          'quotes', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'excerpt', q.excerpt, 'location', q.location))
            from public.flashcards c
            join private.card_source_quotes q on q.card_id = c.id
            where c.set_id = s.id
          ), '[]'::jsonb)
        ) end
        from public.flashcard_sets s
        where s.id = p_set_id and (
          s.user_id = (select auth.uid())
          or exists (
            select 1 from public.assignments a
            join public.classes c on c.id = a.class_id and c.teacher_id = s.user_id
            join public.class_members m on m.class_id = a.class_id and m.student_id = (select auth.uid())
            where a.id = p_class_item_id and a.set_id = s.id and a.allow_source_material
          )
        );
      $body$;
    $fn$;
  else
    execute $fn$
      create or replace function public.study_set_source(
        p_set_id uuid,
        p_class_item_id uuid default null,
        p_include_file boolean default false
      )
      returns jsonb
      language sql stable security definer set search_path = '' as $body$
        select case when p_include_file then (
          select jsonb_build_object('kind', f.kind, 'content_base64', f.content_base64)
          from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id
        ) else jsonb_build_object(
          'name', (select f.name from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id),
          'quotes', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'excerpt', c.source_excerpt, 'location', c.source_location))
            from public.flashcards c
            where c.set_id = s.id and (c.source_excerpt is not null or c.source_location is not null)
          ), '[]'::jsonb)
        ) end
        from public.flashcard_sets s
        where s.id = p_set_id and (
          s.user_id = (select auth.uid())
          or exists (
            select 1 from public.assignments a
            join public.classes c on c.id = a.class_id and c.teacher_id = s.user_id
            join public.class_members m on m.class_id = a.class_id and m.student_id = (select auth.uid())
            where a.id = p_class_item_id and a.set_id = s.id and a.allow_source_material
          )
        );
      $body$;
    $fn$;
  end if;
end $$;

revoke all on function public.study_set_source(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.study_set_source(uuid, uuid, boolean) to anon, authenticated;

commit;
