import { handle, json, readJson, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { loadOwnedSession, assertQuestionInSession } from "../_shared/session.ts";
import { JOKER_KINDS, jokerCost, type JokerKind } from "../_shared/shared/coins.ts";
import type { UseJokerRequest, UseJokerResponse } from "../_shared/shared/types.ts";

const EXTRA_SECONDS = 10;

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<UseJokerRequest>(req);
  if (!JOKER_KINDS.includes(body.kind)) throw new AppError("bad_request", "unknown joker kind");
  const kind: JokerKind = body.kind;
  const admin = adminClient();
  const session = await loadOwnedSession(admin, body.session_id, user.id);
  assertQuestionInSession(session, body.question_id);

  const { data: answered } = await admin.from("answers").select("id")
    .eq("session_id", session.id).eq("question_id", body.question_id).maybeSingle();
  if (answered) throw new AppError("already_answered");

  const { data: profile } = await admin.from("profiles").select("coin_balance").eq("id", user.id).single();
  const cost = jokerCost(kind);
  if ((profile?.coin_balance ?? 0) < cost) throw new AppError("insufficient_coins");

  // Reserve the joker slot first; the primary key makes a second joker fail.
  const { error: jErr } = await admin.from("session_jokers")
    .insert({ session_id: session.id, question_id: body.question_id, kind });
  if (jErr) {
    if ((jErr as { code?: string }).code === "23505") throw new AppError("joker_already_used");
    throw jErr;
  }

  const { error: lErr } = await admin.from("coin_ledger")
    .insert({ user_id: user.id, delta: -cost, reason: `joker_${kind}`, ref_id: body.question_id });
  if (lErr) {
    // Balance check constraint fired (race) -> roll back the reservation.
    await admin.from("session_jokers").delete().eq("session_id", session.id).eq("question_id", body.question_id);
    if ((lErr as { code?: string }).code === "23514") throw new AppError("insufficient_coins");
    throw lErr;
  }

  const { data: after } = await admin.from("profiles").select("coin_balance").eq("id", user.id).single();
  const coin_balance = after!.coin_balance as number;

  let res: UseJokerResponse;
  if (kind === "fifty_fifty") {
    const { data: q } = await admin.from("questions").select("correct_index").eq("id", body.question_id).single();
    const wrong = [0, 1, 2, 3].filter((i) => i !== q!.correct_index);
    // Pick two of the three wrong indices at random.
    wrong.splice(Math.floor(Math.random() * wrong.length), 1);
    res = { kind, remove_indices: [wrong[0]!, wrong[1]!], coin_balance };
  } else if (kind === "extra_time") {
    res = { kind, extra_seconds: EXTRA_SECONDS, coin_balance };
  } else {
    const { error: aErr } = await admin.from("answers")
      .insert({ session_id: session.id, question_id: body.question_id, chosen_index: null, is_correct: false, joker_used: "skip" });
    if (aErr) throw aErr;
    res = { kind, skipped: true, coin_balance };
  }
  return json(res);
}));
