import { handle, json, readJson, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { loadOwnedSession, assertQuestionInSession } from "../_shared/session.ts";
import { coinsForAnswer, type Difficulty } from "../_shared/shared/coins.ts";
import type { SubmitAnswerRequest, SubmitAnswerResponse } from "../_shared/shared/types.ts";

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<SubmitAnswerRequest>(req);
  const chosen = body.chosen_index;
  if (chosen !== null && (!Number.isInteger(chosen) || chosen < 0 || chosen > 3)) {
    throw new AppError("bad_request", "chosen_index must be 0-3 or null");
  }
  const admin = adminClient();
  const session = await loadOwnedSession(admin, body.session_id, user.id);
  assertQuestionInSession(session, body.question_id);

  const { data: question, error: qErr } = await admin.from("questions")
    .select("correct_index, difficulty").eq("id", body.question_id).single();
  if (qErr) throw qErr;

  const isCorrect = chosen !== null && chosen === question.correct_index;
  const { data: joker } = await admin.from("session_jokers").select("kind")
    .eq("session_id", session.id).eq("question_id", body.question_id).maybeSingle();

  const { data: inserted, error: insErr } = await admin.from("answers")
    .insert({ session_id: session.id, question_id: body.question_id, chosen_index: chosen, is_correct: isCorrect, joker_used: joker?.kind ?? null })
    .select("is_correct").maybeSingle();

  let coinsEarned = 0;
  if (insErr) {
    // 23505 = unique_violation: already answered -> idempotent replay.
    if ((insErr as { code?: string }).code !== "23505") throw insErr;
    const { data: existing } = await admin.from("answers").select("is_correct")
      .eq("session_id", session.id).eq("question_id", body.question_id).single();
    const { data: profile } = await admin.from("profiles").select("coin_balance").eq("id", user.id).single();
    const res: SubmitAnswerResponse = {
      is_correct: existing!.is_correct, correct_index: question.correct_index, coins_earned: 0, coin_balance: profile!.coin_balance,
    };
    return json(res);
  }

  if (inserted?.is_correct) {
    coinsEarned = coinsForAnswer(question.difficulty as Difficulty, true);
    const { error: lErr } = await admin.from("coin_ledger")
      .insert({ user_id: user.id, delta: coinsEarned, reason: "correct_answer", ref_id: body.question_id });
    if (lErr) throw lErr;
  }

  const { data: profile } = await admin.from("profiles").select("coin_balance").eq("id", user.id).single();
  const res: SubmitAnswerResponse = {
    is_correct: isCorrect, correct_index: question.correct_index, coins_earned: coinsEarned, coin_balance: profile!.coin_balance,
  };
  return json(res);
}));
