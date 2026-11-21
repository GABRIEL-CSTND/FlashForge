-- #116: the cards' quotes are kept where only study_set_source() reads them
-- (20261121000310). Run against a database with the migrations applied and at
-- least one user. The fixtures are rolled back.
begin;

do $$
declare
  owner_id uuid;
  target_set uuid;
  kept_card uuid;
  edited_card uuid;
  preview jsonb;
begin
  select id into owner_id from auth.users order by id limit 1;
  if owner_id is null then raise exception 'This check needs a user'; end if;

  insert into public.flashcard_sets (user_id, title, study_type)
    values (owner_id, 'Private quotes test', 'flashcard') returning id into target_set;
  insert into public.flashcards (set_id, question, answer, source_excerpt, source_location, position)
    values (target_set, 'Kept', 'Answer', 'Kept quote', 'Page 1', 0) returning id into kept_card;
  insert into public.flashcards (set_id, question, answer, source_excerpt, source_location, position)
    values (target_set, 'Edited', 'Answer', 'Edited quote', 'Page 2', 1) returning id into edited_card;

  if exists (select 1 from public.flashcards where set_id = target_set and (source_excerpt is not null or source_location is not null)) then
    raise exception 'A quote stayed on its card';
  end if;
  if (select count(*) from private.card_source_quotes where card_id in (kept_card, edited_card)) <> 2 then
    raise exception 'The quotes were not kept';
  end if;

  -- Nobody reads the private table directly, the owner included; the owner gets
  -- the quotes through study_set_source().
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  execute 'set local role authenticated';
  begin
    perform 1 from private.card_source_quotes limit 1;
    raise exception 'A signed-in user can read the private quotes';
  exception when insufficient_privilege then null;
  end;
  preview := public.study_set_source(target_set);
  if jsonb_array_length(preview -> 'quotes') <> 2 then
    raise exception 'The owner cannot read the quotes';
  end if;
  reset role;

  -- Saving the edited set (#55): a card that only moves keeps its quote, and a
  -- rewritten one loses it.
  perform * from public.replace_set_cards(target_set, owner_id, jsonb_build_array(
    jsonb_build_object('id', edited_card, 'question', 'Edited', 'answer', 'A new answer'),
    jsonb_build_object('id', kept_card, 'question', 'Kept', 'answer', 'Answer')
  ));
  if not exists (select 1 from private.card_source_quotes where card_id = kept_card and excerpt = 'Kept quote' and location = 'Page 1')
    or exists (select 1 from private.card_source_quotes where card_id = edited_card) then
    raise exception 'Saving the set kept the wrong quotes';
  end if;

  delete from public.flashcards where id = kept_card;
  if exists (select 1 from private.card_source_quotes where card_id = kept_card) then
    raise exception 'A deleted card left its quote behind';
  end if;
end $$;

select 'Private card quote checks passed' as result;
rollback;
