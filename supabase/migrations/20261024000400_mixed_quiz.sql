-- #69: mixed quizzes (Part I multiple choice, Part II true or false, Part III
-- identification). A card's kind comes from its options, so cards need no new
-- column; only study_type needs to allow 'mixed'. The sets check stays NOT
-- VALID (see 20261024000300_true_false.sql).
begin;

alter table public.flashcard_sets drop constraint if exists flashcard_sets_study_type_check;
alter table public.flashcard_sets
  add constraint flashcard_sets_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false', 'mixed')) not valid;

alter table public.attempts drop constraint if exists attempts_study_type_check;
alter table public.attempts
  add constraint attempts_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false', 'mixed'));

alter table public.generation_logs drop constraint if exists generation_logs_study_type_check;
alter table public.generation_logs
  add constraint generation_logs_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false', 'mixed'));

commit;
