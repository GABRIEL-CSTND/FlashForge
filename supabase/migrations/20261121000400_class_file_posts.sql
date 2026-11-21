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

commit;
