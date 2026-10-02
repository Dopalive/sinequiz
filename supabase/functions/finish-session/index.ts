import { handle, json, readJson, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { sessionBonus } from "../_shared/shared/coins.ts";
import type { FinishSessionRequest, FinishSessionResponse } from "../_shared/shared/types.ts";

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<FinishSessionRequest>(req);
  if (!body.session_id) throw new AppError("bad_request", "session_id required");
  const admin = adminClient();

  const { data: session, error } = await admin.from("quiz_sessions")
    .select("id, question_ids, status, score")
    .eq("id", body.session_id).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!session) throw new AppError("session_not_found");

  const total = (session.question_ids as string[]).length;
  const balanceOf = async () =>
    (await admin.from("profiles").select("coin_balance").eq("id", user.id).single()).data!.coin_balance as number;

  if (session.status === "finished") {
    const res: FinishSessionResponse = { score: session.score, total, coins_earned: 0, coin_balance: await balanceOf() };
    return json(res);
  }
  if (session.status !== "in_progress") throw new AppError("session_finished");

  // Close the session first so a concurrent finish sees `finished` and replays.
  const { data: closed, error: cErr } = await admin.from("quiz_sessions")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", session.id).eq("status", "in_progress").select("id").maybeSingle();
  if (cErr) throw cErr;
  if (!closed) {
    const { data: s2 } = await admin.from("quiz_sessions").select("score").eq("id", session.id).single();
    const res: FinishSessionResponse = { score: s2!.score, total, coins_earned: 0, coin_balance: await balanceOf() };
    return json(res);
  }

  const { data: answered } = await admin.from("answers").select("question_id, is_correct").eq("session_id", session.id);
  const answeredIds = new Set((answered ?? []).map((a) => a.question_id as string));
  const missing = (session.question_ids as string[]).filter((id) => !answeredIds.has(id));
  if (missing.length > 0) {
    const { error: mErr } = await admin.from("answers")
      .insert(missing.map((question_id) => ({ session_id: session.id, question_id, chosen_index: null, is_correct: false })));
    if (mErr) throw mErr;
  }

  const score = (answered ?? []).filter((a) => a.is_correct).length;
  const bonus = sessionBonus(score, total);
  const { error: lErr } = await admin.from("coin_ledger")
    .insert({ user_id: user.id, delta: bonus, reason: "session_bonus", ref_id: session.id });
  if (lErr) throw lErr;
  const { error: uErr } = await admin.from("quiz_sessions").update({ score }).eq("id", session.id);
  if (uErr) throw uErr;

  const res: FinishSessionResponse = { score, total, coins_earned: bonus, coin_balance: await balanceOf() };
  return json(res);
}));
