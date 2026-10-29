-- #80 follow-up: a card's quote (source_excerpt, source_location) is the sentence
-- of the uploaded file it was made from. When the owner rewrites the card's
-- question or answer, that sentence may no longer back it, so replace_set_cards()
-- (#55) now clears the quote of a card whose question or answer changes. A card
-- that only moves, or whose choices or explanation change, keeps it.
--
-- Same arguments and result as before (20261024000300_true_false.sql), so the
-- function is replaced in place and keeps its grants; they're repeated anyway.

begin;

create or replace function public.replace_set_cards(p_set_id uuid, p_owner_id uuid, p_cards jsonb)
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
      position = (c.ord - 1)::integer,
      -- A card's quote (#80) only stays while its question and answer are the
      -- ones it was made from. Every expression here reads the row as it was.
      source_excerpt = case when f.question = c.card ->> 'question' and f.answer = c.card ->> 'answer'
                            then f.source_excerpt end,
      source_location = case when f.question = c.card ->> 'question' and f.answer = c.card ->> 'answer'
                             then f.source_location end
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
