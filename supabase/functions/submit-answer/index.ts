import { handle, json, readJson, requireUuid, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { callRpc } from "../_shared/rpc.ts";
import { coinsForAnswer, type Difficulty } from "../_shared/shared/coins.ts";
import type { SubmitAnswerRequest, SubmitAnswerResponse } from "../_shared/shared/types.ts";

interface SubmitAnswerRow extends SubmitAnswerResponse {
  replayed: boolean;
}

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<SubmitAnswerRequest>(req);
  const sessionId = requireUuid(body.session_id, "session_id");
  const questionId = requireUuid(body.question_id, "question_id");
  const chosen = body.chosen_index;
  if (chosen === undefined || (chosen !== null && (!Number.isInteger(chosen) || chosen < 0 || chosen > 3))) {
    throw new AppError("bad_request", "chosen_index must be 0-3 or null");
  }
  const admin = adminClient();

  // Difficulty decides the award; the RPC re-checks session ownership, status and membership atomically.
  const { data: question, error: qErr } = await admin.from("questions")
    .select("difficulty").eq("id", questionId).maybeSingle();
  if (qErr) throw qErr;
  if (!question) throw new AppError("question_not_in_session");
  const award = coinsForAnswer(question.difficulty as Difficulty, true);

  const row = await callRpc<SubmitAnswerRow>(admin, "submit_answer", {
    p_user_id: user.id,
    p_session_id: sessionId,
    p_question_id: questionId,
    p_chosen_index: chosen,
    p_award_if_correct: award,
  });
  const res: SubmitAnswerResponse = {
    is_correct: row.is_correct,
    correct_index: row.correct_index,
    coins_earned: row.coins_earned,
    coin_balance: row.coin_balance,
  };
  return json(res);
}));
