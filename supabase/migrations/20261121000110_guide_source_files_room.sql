-- #111 follow-up: one stored copy of a guide's file, and a limit on the room
-- files take.
--
-- 20261121000100 kept a guide's file with its History entry and copied it again
-- when the guide was saved as a set. Files are kept as base64 text in Postgres,
-- and the free plan's database holds 500 MB before the project turns read-only,
-- so now:
-- - A saved set shares its History entry's row (set_id is filled in, no copy).
--   The row stays while either of the two does, and goes with the last one.
-- - Each user keeps up to 25 MB of files. When a new file doesn't fit, the
--   files of their oldest guides that weren't saved make room for it; it isn't
--   kept if their saved sets' files alone fill the space.
-- - Everyone together keeps up to 150 MB; past that, new files aren't kept.
-- The guide is made either way, without "View source file".

begin;

-- The file's own size, for the limits below.
alter table public.guide_source_files
  add column size_bytes integer generated always as (octet_length(decode(content_base64, 'base64'))) stored;

-- Deleting a History entry or a set now only unlinks its file.
alter table public.guide_source_files
  drop constraint guide_source_files_check,
  drop constraint guide_source_files_history_id_fkey,
  drop constraint guide_source_files_set_id_fkey,
  add constraint guide_source_files_history_id_fkey
    foreign key (history_id) references public.guide_history (id) on delete set null,
  add constraint guide_source_files_set_id_fkey
    foreign key (set_id) references public.flashcard_sets (id) on delete set null;

-- Copies the old trigger made for saved guides: the History row takes the set,
-- and the copy goes.
create temporary table saved_copies on commit drop as
  select distinct on (set_copy.id) history_file.id as keep_id, set_copy.id as copy_id, set_copy.set_id
  from public.guide_source_files history_file
  join public.guide_history g on g.id = history_file.history_id
  join public.guide_source_files set_copy
    on set_copy.set_id = g.set_id and set_copy.history_id is null and set_copy.user_id = history_file.user_id
  where history_file.set_id is null
  order by set_copy.id, history_file.id;
delete from public.guide_source_files where id in (select copy_id from saved_copies);
update public.guide_source_files f set set_id = c.set_id from saved_copies c where f.id = c.keep_id;

drop trigger copy_guide_source_file_after_save on public.guide_history;
drop function public.copy_guide_source_file();

-- Saving a History entry as a set (markSaved) gives the set the entry's file.
-- The set must belong to the file's owner.
create function private.link_guide_source_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.guide_source_files f
  set set_id = new.set_id
  where f.history_id = new.id
    and f.user_id = new.user_id
    and f.set_id is null
    and exists (select 1 from public.flashcard_sets s where s.id = new.set_id and s.user_id = f.user_id)
    and not exists (select 1 from public.guide_source_files other where other.set_id = new.set_id);
  return new;
end;
$$;

revoke all on function private.link_guide_source_file() from public, anon, authenticated;

create trigger link_guide_source_file_after_save
  after update of set_id on public.guide_history
  for each row when (new.set_id is not null and new.set_id is distinct from old.set_id)
  execute function private.link_guide_source_file();

-- A file left with neither a History entry nor a set is deleted.
create function private.drop_unlinked_guide_source_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.guide_source_files where id = new.id;
  return null;
end;
$$;

revoke all on function private.drop_unlinked_guide_source_file() from public, anon, authenticated;

create trigger drop_unlinked_guide_source_file
  after update of history_id, set_id on public.guide_source_files
  for each row when (new.history_id is null and new.set_id is null)
  execute function private.drop_unlinked_guide_source_file();

-- The limits, in bytes of file. Change them by replacing this function.
create function private.source_file_room(out per_user bigint, out everyone bigint)
language sql stable as $$
  select 25::bigint * 1024 * 1024, 150::bigint * 1024 * 1024
$$;

revoke all on function private.source_file_room() from public, anon, authenticated;

-- Before a file is kept: make room in its owner's space, or refuse it. A refusal
-- also undoes the room made for it.
create function private.make_room_for_guide_source_file() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  room record;
  needed bigint := octet_length(decode(new.content_base64, 'base64'));
  used bigint;
  oldest uuid;
begin
  if new.history_id is null and new.set_id is null then
    raise exception 'a source file needs a History entry or a set' using errcode = '23514';
  end if;
  select * into room from private.source_file_room();
  -- One file at a time per owner, so two guides can't take the same room.
  perform pg_advisory_xact_lock(hashtext('guide_source_files:' || new.user_id::text));
  loop
    select coalesce(sum(f.size_bytes), 0) into used from public.guide_source_files f where f.user_id = new.user_id;
    exit when used + needed <= room.per_user;
    oldest := null;
    select f.id into oldest
    from public.guide_source_files f
    join public.guide_history g on g.id = f.history_id
    where f.user_id = new.user_id and f.set_id is null
    order by g.created_at, f.id
    limit 1;
    if oldest is null then
      raise exception 'no room left for this user''s source files' using errcode = 'PT413';
    end if;
    delete from public.guide_source_files where id = oldest;
  end loop;
  if (select coalesce(sum(f.size_bytes), 0) from public.guide_source_files f) + needed > room.everyone then
    raise exception 'no room left for source files' using errcode = 'PT413';
  end if;
  return new;
end;
$$;

revoke all on function private.make_room_for_guide_source_file() from public, anon, authenticated;

create trigger make_room_for_guide_source_file
  before insert on public.guide_source_files
  for each row execute function private.make_room_for_guide_source_file();

commit;
