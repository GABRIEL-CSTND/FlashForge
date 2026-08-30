-- Run this in your Supabase project's SQL editor (Dashboard > SQL Editor > New query)
-- Creates the flashcards table linked to flashcard_sets.

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references flashcard_sets(id) on delete cascade,
  question text not null,
  answer text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_set_id_idx on flashcards(set_id);

-- Allow anon read/insert since this app has no auth yet (matches flashcard_sets policy).
alter table flashcards enable row level security;

create policy "Allow anon read flashcards"
  on flashcards for select
  to anon
  using (true);

create policy "Allow anon insert flashcards"
  on flashcards for insert
  to anon
  with check (true);
