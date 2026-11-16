-- History: every study guide a signed-in user generates, saved or not, so a
-- guide they didn't save isn't lost. My Sets still lists only saved sets.
--
-- Written only by the server (service role): /api/generate adds each guide it
-- makes for a signed-in user, and /api/save-set records which set it was saved
-- as. Owners can read and remove their own entries; nobody else can see them,
-- teachers and admins included.

begin;

create table if not exists public.guide_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  study_type text not null check (study_type in ('flashcard', 'multiple_choice', 'true_false', 'mixed')),
  -- The file's name, or the link of the web page or Wikipedia article; null for pasted notes.
  source_filename text,
  -- Credit for a web page or Wikipedia article, {"name", "url"}; null otherwise.
  source_credit jsonb check (source_credit is null or jsonb_typeof(source_credit) = 'object'),
  -- The cards as they were generated, quotes included (lib/source-quotes.ts).
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  item_count integer generated always as (
    case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) end
  ) stored,
  -- The set it was saved as: null until it's saved, and again if that set is deleted.
  set_id uuid references public.flashcard_sets (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists guide_history_user_idx on public.guide_history (user_id, created_at desc);
create index if not exists guide_history_set_idx on public.guide_history (set_id);

alter table public.guide_history enable row level security;

revoke all on table public.guide_history from anon, authenticated;
grant select, delete on table public.guide_history to authenticated;

drop policy if exists "Owners read their own history" on public.guide_history;
create policy "Owners read their own history"
  on public.guide_history for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Owners remove their own history" on public.guide_history;
create policy "Owners remove their own history"
  on public.guide_history for delete
  to authenticated
  using (user_id = (select auth.uid()));

commit;
