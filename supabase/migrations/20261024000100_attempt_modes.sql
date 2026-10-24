-- #66: how a flashcard set was studied. Null is the study type's normal way
-- (flipping and self-marking, for flashcards), so attempts saved before this
-- need no change. 'type' means the student typed the answers and the server
-- checked them. Only flashcard sets can be studied another way.
alter table public.attempts add column if not exists mode text;

alter table public.attempts drop constraint if exists attempts_mode_check;
alter table public.attempts
  add constraint attempts_mode_check
  check (mode is null or (mode in ('type') and study_type = 'flashcard'));
