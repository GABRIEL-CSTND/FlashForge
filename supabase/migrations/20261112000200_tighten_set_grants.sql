-- Follow-up to 20261112000100_server_only_card_writes.sql (PR #84 review).
--
-- 1. Signed-in users kept UPDATE on every column of their own sets, but the browser
--    only ever renames a set (app/sets/[id]/page.tsx). With the public key, an owner
--    could change a set's study_type (a flashcard set claiming to be multiple choice
--    has cards with no options, which breaks studying and scoring) or its created_at.
--    Now they can update the title only. Revoking the table-level grant also removes
--    any column-level UPDATE grants, so the title grant below is the only one left.
-- 2. Supabase's default grants also give anon and signed-in users TRUNCATE, TRIGGER
--    and REFERENCES. TRUNCATE ignores RLS. PostgREST can't send it, but nothing in
--    the browser needs any of the three, so they go too.
--
-- Unchanged: SELECT on both tables (RLS decides which rows), DELETE on flashcard_sets
-- for signed-in users (owners delete their own sets; the cards go with them through
-- the foreign key, which runs as the table owner).

begin;

revoke update on table public.flashcard_sets from authenticated;
grant update (title) on table public.flashcard_sets to authenticated;

revoke truncate, trigger, references on table public.flashcards, public.flashcard_sets
  from anon, authenticated;

commit;
