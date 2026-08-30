-- Run this in Supabase SQL Editor. Adds delete/update permissions needed
-- for the sets dashboard (rename + delete a set), matching the existing
-- open-access (anon) pattern used elsewhere since there's no auth yet.
-- Safe to re-run: drops the policy first if it already exists.

drop policy if exists "Allow anon update flashcard_sets" on flashcard_sets;
create policy "Allow anon update flashcard_sets"
  on flashcard_sets for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anon delete flashcard_sets" on flashcard_sets;
create policy "Allow anon delete flashcard_sets"
  on flashcard_sets for delete
  to anon
  using (true);
