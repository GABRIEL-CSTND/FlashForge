-- #68: true-or-false study guides.
--
-- - study_type allows 'true_false' on sets, attempts and generation logs.
--   Sets get a study_type check for the first time (before, any text was
--   accepted). It's NOT VALID because one legacy set from August says
--   'identification'; the app shows it as flashcards, and as it has no owner
--   nobody can update it.
-- - Cards get an optional explanation, shown after answering: for a false
--   statement, the corrected fact.
-- - replace_set_cards() (#55) saves and returns the explanation. Its result
--   gains a column, so it's dropped and created again (same arguments).
begin;

alter table public.flashcard_sets drop constraint if exists flashcard_sets_study_type_check;
alter table public.flashcard_sets
  add constraint flashcard_sets_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false')) not valid;

alter table public.attempts drop constraint if exists attempts_study_type_check;
alter table public.attempts
  add constraint attempts_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false'));

alter table public.generation_logs drop constraint if exists generation_logs_study_type_check;
alter table public.generation_logs
  add constraint generation_logs_study_type_check
  check (study_type in ('flashcard', 'multiple_choice', 'true_false'));

alter table public.flashcards add column if not exists explanation text;
alter table public.flashcards drop constraint if exists flashcards_explanation_check;
alter table public.flashcards
  add constraint flashcards_explanation_check
  check (explanation is null or char_length(explanation) between 1 and 300);

drop function if exists public.replace_set_cards(uuid, uuid, jsonb);
create function public.replace_set_cards(p_set_id uuid, p_owner_id uuid, p_cards jsonb)
returns table (id uuid, question text, answer text, options jsonb, explanation text, "position" integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Only the set's owner, and lock the row so two saves of one set queue up.
  perform 1 from public.flashcard_sets s
    where s.id = p_set_id and s.user_id = p_owner_id
    for update;
  if not found then
    raise exception 'set % not found for this owner', p_set_id using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception 'p_cards must be a JSON array' using errcode = '22023';
  end if;

  -- Ids sent back must belong to this set, and each may appear only once.
  if exists (
    select 1
    from jsonb_array_elements(p_cards) as e(card)
    where e.card ->> 'id' is not null
      and not exists (
        select 1 from public.flashcards f
        where f.id = (e.card ->> 'id')::uuid and f.set_id = p_set_id
      )
  ) then
    raise exception 'a card does not belong to set %', p_set_id using errcode = '22023';
  end if;
  if (
    select count(e.card ->> 'id') <> count(distinct e.card ->> 'id')
    from jsonb_array_elements(p_cards) as e(card)
  ) then
    raise exception 'a card appears twice' using errcode = '22023';
  end if;

  delete from public.flashcards f
  where f.set_id = p_set_id
    and f.id not in (
      select (e.card ->> 'id')::uuid
      from jsonb_array_elements(p_cards) as e(card)
      where e.card ->> 'id' is not null
    );

  update public.flashcards f
  set question = c.card ->> 'question',
      answer = c.card ->> 'answer',
      options = case when jsonb_typeof(c.card -> 'options') = 'array' then c.card -> 'options' end,
      explanation = nullif(c.card ->> 'explanation', ''),
      position = (c.ord - 1)::integer
  from jsonb_array_elements(p_cards) with ordinality as c(card, ord)
  where c.card ->> 'id' is not null
    and f.id = (c.card ->> 'id')::uuid
    and f.set_id = p_set_id;

  insert into public.flashcards (set_id, question, answer, options, explanation, position)
  select p_set_id,
         c.card ->> 'question',
         c.card ->> 'answer',
         case when jsonb_typeof(c.card -> 'options') = 'array' then c.card -> 'options' end,
         nullif(c.card ->> 'explanation', ''),
         (c.ord - 1)::integer
  from jsonb_array_elements(p_cards) with ordinality as c(card, ord)
  where c.card ->> 'id' is null;

  return query
    select f.id, f.question, f.answer, f.options, f.explanation, f.position
    from public.flashcards f
    where f.set_id = p_set_id
    order by f.position;
end;
$$;

revoke all on function public.replace_set_cards(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_set_cards(uuid, uuid, jsonb) to service_role;

commit;
