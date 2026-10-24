-- #67: matching is a third way to study a flashcard set, next to flipping
-- (null) and typing ('type', #66). Still only for flashcard sets.
alter table public.attempts drop constraint if exists attempts_mode_check;
alter table public.attempts
  add constraint attempts_mode_check
  check (mode is null or (mode in ('type', 'match') and study_type = 'flashcard'));
