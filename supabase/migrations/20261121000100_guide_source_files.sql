begin;

-- Keep file bytes out of guide and set queries. Each copy follows the lifetime
-- of its parent, so deleting one guide never removes the other guide's file.
create table public.guide_source_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  history_id uuid unique references public.guide_history (id) on delete cascade,
  set_id uuid unique references public.flashcard_sets (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('pdf', 'pdf-text', 'docx', 'pptx', 'txt', 'jpeg', 'png', 'webp')),
  content_base64 text not null check (length(content_base64) between 1 and 5592408),
  check (num_nonnulls(history_id, set_id) = 1)
);

create index guide_source_files_user_idx on public.guide_source_files (user_id);

alter table public.guide_source_files enable row level security;
revoke all on public.guide_source_files from anon, authenticated;
grant select on public.guide_source_files to anon, authenticated;
grant select, insert on public.guide_source_files to service_role;

create policy "Owners read their own source files"
  on public.guide_source_files for select to authenticated
  using (user_id = (select auth.uid()));

-- Copy the source in the same transaction as markSaved. The set must belong
-- to the file owner even if an internal caller passes the wrong set id.
create function public.copy_guide_source_file() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.guide_source_files (user_id, set_id, name, kind, content_base64)
  select file.user_id, new.set_id, file.name, file.kind, file.content_base64
  from public.guide_source_files file
  join public.flashcard_sets saved on saved.id = new.set_id and saved.user_id = file.user_id
  where file.history_id = new.id and file.user_id = new.user_id
  on conflict (set_id) do nothing;
  return new;
end;
$$;

revoke all on function public.copy_guide_source_file() from public, anon, authenticated;

create trigger copy_guide_source_file_after_save
  after update of set_id on public.guide_history
  for each row when (new.set_id is not null and new.set_id is distinct from old.set_id)
  execute function public.copy_guide_source_file();

commit;
