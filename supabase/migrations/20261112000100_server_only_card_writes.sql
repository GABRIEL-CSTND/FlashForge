-- Card and set creation is server-only.
--
-- Sets and cards are written by app/api/save-set/route.ts and the set editor
-- route, which use the service-role key (lib/supabase-admin.ts, server only).
-- RLS already has no insert policy for either table, but the table-level
-- INSERT/UPDATE/DELETE grants to the public anon/authenticated roles were
-- still in place. Remove them so a holder of the public key cannot write
-- cards at all, even if a permissive policy is added by mistake later.
--
-- Kept for signed-in users: SELECT on both tables, and UPDATE/DELETE on
-- flashcard_sets (the browser renames and deletes the user's own sets;
-- the "Owner can ..." policies still limit that to the owner).

revoke insert, update, delete on table public.flashcards from anon, authenticated;
revoke insert on table public.flashcard_sets from anon, authenticated;
revoke update, delete on table public.flashcard_sets from anon;
