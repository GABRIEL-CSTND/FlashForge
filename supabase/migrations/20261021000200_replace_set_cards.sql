-- #55: save a study set's edited cards in one transaction.
--
-- PUT /api/sets/[id]/cards validates the cards first (lib/card-rules.ts) and
-- then calls this with the service role. The edit is applied as a diff so
-- cards keep their ids (study results and insights will refer to them,
-- #57/#59):
--   - cards in p_cards with an id are updated (text, choices, position)
--   - cards without an id are inserted
--   - the set's other cards are deleted
-- Positions follow the order of p_cards. Either all of it happens or none of it.
create or replace function public.replace_set_cards(p_set_id uuid, p_owner_id uuid, p_cards jsonb)
returns table (id uuid, question text, answer text, options jsonb, "position" integer)
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
      position = (c.ord - 1)::integer
  from jsonb_array_elements(p_cards) with ordinality as c(card, ord)
  where c.card ->> 'id' is not null
    and f.id = (c.card ->> 'id')::uuid
    and f.set_id = p_set_id;

  insert into public.flashcards (set_id, question, answer, options, position)
  select p_set_id,
         c.card ->> 'question',
         c.card ->> 'answer',
         case when jsonb_typeof(c.card -> 'options') = 'array' then c.card -> 'options' end,
         (c.ord - 1)::integer
  from jsonb_array_elements(p_cards) with ordinality as c(card, ord)
  where c.card ->> 'id' is null;

  return query
    select f.id, f.question, f.answer, f.options, f.position
    from public.flashcards f
    where f.set_id = p_set_id
    order by f.position;
end;
$$;

revoke all on function public.replace_set_cards(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_set_cards(uuid, uuid, jsonb) to service_role;
