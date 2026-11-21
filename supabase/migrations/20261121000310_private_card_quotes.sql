-- #116, part two: keep the cards' quotes where a class's students can't read them.
--
-- The students of a class can read the cards of a set shared with it (RLS), and
-- with them source_excerpt and source_location, whatever the teacher chose. This
-- moves the quotes to private.card_source_quotes, which only study_set_source()
-- reads. The two columns stay as write inputs (for /api/save-set and
-- replace_set_cards()): a trigger moves whatever is written there.
--
-- Apply it with the release to main, not before: an app that reads the quotes
-- from the cards (every build before #116) shows none once this is applied.

begin;

lock table public.flashcards in share row exclusive mode;

-- Deferred, because the trigger below adds a card's quote before the card itself.
create table private.card_source_quotes (
  card_id uuid primary key references public.flashcards (id) on delete cascade deferrable initially deferred,
  excerpt text,
  location text
);
revoke all on private.card_source_quotes from public, anon, authenticated;

insert into private.card_source_quotes (card_id, excerpt, location)
select id, source_excerpt, source_location from public.flashcards
where source_excerpt is not null or source_location is not null;

update public.flashcards set source_excerpt = null, source_location = null
where source_excerpt is not null or source_location is not null;

-- What's written to the two columns goes to the private table. A card whose
-- question or answer changes loses its quote, as replace_set_cards() did.
create function private.store_card_source_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.question is distinct from old.question or new.answer is distinct from old.answer) then
    delete from private.card_source_quotes where card_id = old.id;
  end if;
  if new.source_excerpt is not null or new.source_location is not null then
    insert into private.card_source_quotes (card_id, excerpt, location)
    values (new.id, new.source_excerpt, new.source_location)
    on conflict (card_id) do update set excerpt = excluded.excerpt, location = excluded.location;
  end if;
  new.source_excerpt := null;
  new.source_location := null;
  return new;
end;
$$;

revoke all on function private.store_card_source_quote() from public, anon, authenticated;

create trigger store_card_source_quote before insert or update on public.flashcards
for each row execute function private.store_card_source_quote();

-- study_set_source() (20261121000300) now reads the quotes from the private table.
-- Same arguments and rules, so it keeps its grants.
create or replace function public.study_set_source(p_set_id uuid, p_class_item_id uuid default null, p_include_file boolean default false)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_include_file then (
    select jsonb_build_object('kind', f.kind, 'content_base64', f.content_base64)
    from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id
  ) else jsonb_build_object(
    'name', (select f.name from public.guide_source_files f where f.set_id = s.id and f.user_id = s.user_id),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'excerpt', q.excerpt, 'location', q.location))
      from public.flashcards c join private.card_source_quotes q on q.card_id = c.id
      where c.set_id = s.id
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

commit;
