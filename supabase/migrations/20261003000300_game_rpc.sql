-- Transactional game RPCs: each coin-paying mutation runs as ONE Postgres function so a failure or a
-- race between steps can never leave money-inconsistent state. Called only by Edge Functions through
-- the service role (admin.rpc). Coin amounts are computed in TypeScript (packages/shared) and passed in.
-- Business errors are raised with errcode P0001 and the shared ErrorCode string as the message.
-- Every function locks the session row first so submit / joker / finish serialize per session.

-- Defense in depth: at most one session bonus per session.
create unique index coin_ledger_session_bonus_uidx on coin_ledger (ref_id) where reason = 'session_bonus';

-- Idempotent: an existing answer for (session, question) returns the stored result with
-- coins_earned = 0 and replayed = true.
create function submit_answer(
  p_user_id uuid, p_session_id uuid, p_question_id uuid,
  p_chosen_index smallint,      -- null = timed out
  p_award_if_correct integer    -- coinsForAnswer(difficulty, true), computed in TS
) returns table (is_correct boolean, correct_index smallint, coins_earned integer, coin_balance integer, replayed boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_session quiz_sessions%rowtype;
  v_correct_index smallint;
  v_is_correct boolean;
  v_joker text;
  v_existing boolean;
begin
  select * into v_session from quiz_sessions s
   where s.id = p_session_id and s.user_id = p_user_id
   for update;
  if not found then
    raise exception using message = 'session_not_found', errcode = 'P0001';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception using message = 'session_finished', errcode = 'P0001';
  end if;
  if not (p_question_id = any(v_session.question_ids)) then
    raise exception using message = 'question_not_in_session', errcode = 'P0001';
  end if;

  select q.correct_index into v_correct_index from questions q where q.id = p_question_id;

  select a.is_correct into v_existing from answers a
   where a.session_id = p_session_id and a.question_id = p_question_id;
  if found then
    return query select v_existing, v_correct_index, 0,
      (select p.coin_balance from profiles p where p.id = p_user_id), true;
    return;
  end if;

  select j.kind into v_joker from session_jokers j
   where j.session_id = p_session_id and j.question_id = p_question_id;

  v_is_correct := p_chosen_index is not null and p_chosen_index = v_correct_index;
  insert into answers (session_id, question_id, chosen_index, is_correct, joker_used)
  values (p_session_id, p_question_id, p_chosen_index, v_is_correct, v_joker);

  if v_is_correct then
    insert into coin_ledger (user_id, delta, reason, ref_id)
    values (p_user_id, p_award_if_correct, 'correct_answer', p_question_id);
  end if;

  return query select v_is_correct, v_correct_index,
    case when v_is_correct then p_award_if_correct else 0 end,
    (select p.coin_balance from profiles p where p.id = p_user_id), false;
end $$;

-- Charges p_cost and records the joker. Returns the question's correct_index so the Edge Function can
-- pick fifty_fifty removals; the Edge Function never sends it to the client.
-- Idempotent per kind: if this question already has a joker of the SAME kind (a client retry), nothing is
-- charged and the current balance is returned with replayed = true. A different kind is joker_already_used.
create function use_joker(
  p_user_id uuid, p_session_id uuid, p_question_id uuid,
  p_kind text,                  -- validated in TS against JOKER_KINDS
  p_cost integer                -- jokerCost(kind), positive
) returns table (coin_balance integer, correct_index smallint, replayed boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_session quiz_sessions%rowtype;
  v_balance integer;
  v_existing_kind text;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception using message = 'bad_request', errcode = 'P0001';
  end if;

  select * into v_session from quiz_sessions s
   where s.id = p_session_id and s.user_id = p_user_id
   for update;
  if not found then
    raise exception using message = 'session_not_found', errcode = 'P0001';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception using message = 'session_finished', errcode = 'P0001';
  end if;
  if not (p_question_id = any(v_session.question_ids)) then
    raise exception using message = 'question_not_in_session', errcode = 'P0001';
  end if;
  -- Joker check before the answer check: a replayed skip already has its answer row.
  select j.kind into v_existing_kind from session_jokers j
   where j.session_id = p_session_id and j.question_id = p_question_id;
  if found then
    if v_existing_kind = p_kind then
      return query select
        (select p.coin_balance from profiles p where p.id = p_user_id),
        (select q.correct_index from questions q where q.id = p_question_id),
        true;
      return;
    end if;
    raise exception using message = 'joker_already_used', errcode = 'P0001';
  end if;
  if exists (select 1 from answers a where a.session_id = p_session_id and a.question_id = p_question_id) then
    raise exception using message = 'already_answered', errcode = 'P0001';
  end if;

  select p.coin_balance into v_balance from profiles p where p.id = p_user_id for update;
  if v_balance is null or v_balance < p_cost then
    raise exception using message = 'insufficient_coins', errcode = 'P0001';
  end if;

  insert into session_jokers (session_id, question_id, kind) values (p_session_id, p_question_id, p_kind);
  insert into coin_ledger (user_id, delta, reason, ref_id)
  values (p_user_id, -p_cost, 'joker_' || p_kind, p_question_id);
  if p_kind = 'skip' then
    insert into answers (session_id, question_id, chosen_index, is_correct, joker_used)
    values (p_session_id, p_question_id, null, false, 'skip');
  end if;

  return query select
    (select p.coin_balance from profiles p where p.id = p_user_id),
    (select q.correct_index from questions q where q.id = p_question_id),
    false;
end $$;

-- Closes the session, fills unanswered questions, pays the finish (+ perfect) bonus once.
-- Idempotent: a finished session returns its stored score with coins_earned = 0.
create function finish_session(
  p_user_id uuid, p_session_id uuid,
  p_finish_bonus integer,       -- COINS.SESSION_FINISH
  p_perfect_bonus integer       -- COINS.PERFECT_BONUS
) returns table (score integer, total integer, coins_earned integer, coin_balance integer)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_session quiz_sessions%rowtype;
  v_total integer;
  v_score integer;
  v_bonus integer;
begin
  select * into v_session from quiz_sessions s
   where s.id = p_session_id and s.user_id = p_user_id
   for update;
  if not found then
    raise exception using message = 'session_not_found', errcode = 'P0001';
  end if;
  v_total := coalesce(cardinality(v_session.question_ids), 0);

  if v_session.status = 'finished' then
    return query select v_session.score, v_total, 0,
      (select p.coin_balance from profiles p where p.id = p_user_id);
    return;
  end if;
  if v_session.status <> 'in_progress' then
    raise exception using message = 'session_finished', errcode = 'P0001';
  end if;

  insert into answers (session_id, question_id, chosen_index, is_correct)
  select p_session_id, qid, null, false
    from unnest(v_session.question_ids) as qid
  on conflict (session_id, question_id) do nothing;

  select count(*)::integer into v_score from answers a
   where a.session_id = p_session_id and a.is_correct;
  v_bonus := p_finish_bonus + case when v_total > 0 and v_score = v_total then p_perfect_bonus else 0 end;

  insert into coin_ledger (user_id, delta, reason, ref_id)
  values (p_user_id, v_bonus, 'session_bonus', p_session_id);

  update quiz_sessions s set status = 'finished', finished_at = now(), score = v_score
   where s.id = p_session_id;

  return query select v_score, v_total, v_bonus,
    (select p.coin_balance from profiles p where p.id = p_user_id);
end $$;

revoke execute on function submit_answer(uuid, uuid, uuid, smallint, integer) from public, anon, authenticated;
revoke execute on function use_joker(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function finish_session(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function submit_answer(uuid, uuid, uuid, smallint, integer) to service_role;
grant execute on function use_joker(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function finish_session(uuid, uuid, integer, integer) to service_role;
