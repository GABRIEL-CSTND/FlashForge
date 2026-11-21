-- #116: a teacher can share a set's source material (its file and its cards'
-- quotes) with a class, one class item at a time. Sharing is off unless the
-- teacher turns it on.
--
-- Safe to apply before this code reaches the live site: it only adds a column
-- and a function. Hiding the quotes from the cards themselves is the next
-- migration, 20261121000310_private_card_quotes.sql, which goes with the
-- release to main.

begin;

alter table public.assignments add column allow_source_material boolean not null default false;

-- A set's source material for the caller: the file's name and the cards' quotes,
-- or the file itself (p_include_file). The set's owner always gets it. Anyone
-- gets the quotes of a set made before sign-in, whose cards everyone can read
-- anyway. A student gets it only through a class item that shares it: an item of
-- one of their classes, for this set, posted by the set's owner, with sharing on.
-- A bare set id, or another class's item, grants nothing.
create function public.study_set_source(p_set_id uuid, p_class_item_id uuid default null, p_include_file boolean default false)
returns jsonb
language sql stable security definer set search_path = '' as $$
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
    or (s.user_id is null and not p_include_file)
    or exists (
      select 1 from public.assignments a
      join public.classes c on c.id = a.class_id and c.teacher_id = s.user_id
      join public.class_members m on m.class_id = a.class_id and m.student_id = (select auth.uid())
      where a.id = p_class_item_id and a.set_id = s.id and a.allow_source_material
    )
  );
$$;

revoke all on function public.study_set_source(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.study_set_source(uuid, uuid, boolean) to anon, authenticated;

commit;
