begin;

-- Files were private before this feature. Share them only by a teacher's choice.
alter table public.assignments add column allow_source_material boolean not null default false;

-- Keep quotes off rows that any enrolled student can read. Keep the original
-- columns as write inputs for older app builds and replace_set_cards().
lock table public.flashcards in share row exclusive mode;
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

-- Both the initial preview and the subsequent file request check the exact
-- class item. A bare set URL or another class's item ID grants no access.
create function public.study_set_source(p_set_id uuid, p_class_item_id uuid default null, p_include_file boolean default false)
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

revoke all on function public.study_set_source(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.study_set_source(uuid, uuid, boolean) to anon, authenticated;

commit;
