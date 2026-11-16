-- #46: close two holes found while reviewing the baseline policies.
--
-- 1. "Allow anon read flashcards" let anyone holding the public anon key read
--    EVERY card, including cards in signed-in users' private sets (110 cards
--    at the time). "Cards are viewable if set is viewable" already gives the
--    right access, so this policy is simply dropped.
--
-- 2. "Anyone can insert a set" (with check true) let anyone insert sets with
--    any user_id, e.g. plant sets in another user's My Sets. The app saves
--    sets through app/api/save-set/route.ts with the service-role key, which
--    bypasses RLS, so no insert policy is needed at all.

drop policy if exists "Allow anon read flashcards" on public.flashcards;
drop policy if exists "Anyone can insert a set" on public.flashcard_sets;
