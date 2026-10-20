-- #46: baseline. The schema and RLS policies exactly as they existed in the
-- live database on 2026-10-20, before these files were added to the repo.
-- Already applied; kept so the starting point can be reviewed and rebuilt.
-- Two of these policies were security holes and are removed in the next
-- migration (20261020000050_tighten_rls.sql).

create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  -- Null for sets created before sign-in was required (legacy, publicly readable).
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  source_filename text,
  created_at timestamptz not null default now(),
  study_type text not null default 'flashcard'
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  question text not null,
  answer text not null,
  position integer not null default 0,
  -- Multiple-choice options (array of 4 strings); null for flashcards.
  options jsonb
);

create index if not exists flashcards_set_id_idx on public.flashcards using btree (set_id);

alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;

-- flashcard_sets
create policy "Anyone can insert a set"
  on public.flashcard_sets for insert
  to public
  with check (true);

create policy "Sets are viewable by owner or anon-created"
  on public.flashcard_sets for select
  to public
  using ((user_id is null) or (auth.uid() = user_id));

create policy "Owner can update their set"
  on public.flashcard_sets for update
  to public
  using (auth.uid() = user_id);

create policy "Owner can delete their set"
  on public.flashcard_sets for delete
  to public
  using (auth.uid() = user_id);

-- flashcards (no insert/update/delete policies: writes go through the
-- service-role key in app/api/save-set/route.ts)
create policy "Allow anon read flashcards"
  on public.flashcards for select
  to anon
  using (true);

create policy "Cards are viewable if set is viewable"
  on public.flashcards for select
  to public
  using (
    exists (
      select 1
      from public.flashcard_sets s
      where s.id = flashcards.set_id
        and ((s.user_id is null) or (auth.uid() = s.user_id))
    )
  );

-- Also present in the project (created by Supabase, not by us): an event
-- trigger `ensure_rls` running public.rls_auto_enable(), which turns on RLS
-- for every new table automatically.
