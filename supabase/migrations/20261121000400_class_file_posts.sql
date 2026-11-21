begin;

-- File metadata and bytes follow the class lifetime in a single transaction.
create table public.class_files (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 200
    and name !~ '[[:cntrl:]/]'
    and strpos(name, chr(92)) = 0
    and lower(name) ~ '\.(pdf|docx|pptx|txt|jpe?g|png|webp)$'
  ),
  content_base64 text not null check (octet_length(content_base64) <= 5592408),
  size_bytes integer generated always as (octet_length(decode(content_base64, 'base64'))) stored,
  created_at timestamptz not null default now(),
  check (size_bytes between 1 and 4194304)
);

create index class_files_class_created_idx on public.class_files (class_id, created_at desc, id desc);
alter table public.class_files enable row level security;

revoke all on public.class_files from public, anon, authenticated;
grant select, delete on public.class_files to authenticated;
grant insert (class_id, name, content_base64) on public.class_files to authenticated;

create policy "Class teachers and members read files"
  on public.class_files for select to authenticated
  using (private.is_class_teacher(class_id) or private.is_class_member(class_id));

create policy "Class teachers post files"
  on public.class_files for insert to authenticated
  with check (
    private.is_class_teacher(class_id)
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher', 'admin'))
  );

create policy "Class teachers remove files"
  on public.class_files for delete to authenticated
  using (
    private.is_class_teacher(class_id)
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher', 'admin'))
  );

-- The files are base64 text in Postgres, whose free plan turns read-only at
-- 500 MB, so their room is limited: up to 50 MB of files a teacher (all their
-- classes together) and 100 MB for everyone. Change them by replacing this function.
create function private.class_file_room(out per_teacher bigint, out everyone bigint)
language sql stable as $$
  select 50::bigint * 1024 * 1024, 100::bigint * 1024 * 1024
$$;

revoke all on function private.class_file_room() from public, anon, authenticated;

-- A file that doesn't fit is refused with PT413, which the API answers as 413
-- Payload Too Large; the hint says whose room is full ('teacher' or 'everyone').
create function private.check_class_file_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  room record;
  teacher uuid;
  needed bigint;
begin
  -- Files too big to keep, and posts the policy turns away, are left to the
  -- checks and the policy.
  if octet_length(new.content_base64) > 5592408 then
    return new;
  end if;
  needed := octet_length(decode(new.content_base64, 'base64'));
  if needed > 4194304 then
    return new;
  end if;
  if (select auth.uid()) is not null and not private.is_class_teacher(new.class_id) then
    return new;
  end if;
  select c.teacher_id into teacher from public.classes c where c.id = new.class_id;
  select * into room from private.class_file_room();
  -- One file at a time per teacher, so two posts can't take the same room.
  perform pg_advisory_xact_lock(hashtext('class_files:' || coalesce(teacher::text, '')));
  if (select coalesce(sum(f.size_bytes), 0)
      from public.class_files f join public.classes c on c.id = f.class_id
      where c.teacher_id = teacher) + needed > room.per_teacher then
    raise exception 'no room left for this teacher''s class files' using errcode = 'PT413', hint = 'teacher';
  end if;
  if (select coalesce(sum(f.size_bytes), 0) from public.class_files f) + needed > room.everyone then
    raise exception 'no room left for class files' using errcode = 'PT413', hint = 'everyone';
  end if;
  return new;
end;
$$;

revoke all on function private.check_class_file_room() from public, anon, authenticated;

create trigger check_class_file_room
  before insert on public.class_files
  for each row execute function private.check_class_file_room();

commit;
