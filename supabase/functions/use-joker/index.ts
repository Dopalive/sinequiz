import { handle, json, readJson, requireUuid, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { callRpc } from "../_shared/rpc.ts";
import { fiftyFiftyRemovals } from "../_shared/fiftyFifty.ts";
import { JOKER_KINDS, jokerCost, type JokerKind } from "../_shared/shared/coins.ts";
import type { UseJokerRequest, UseJokerResponse } from "../_shared/shared/types.ts";

const EXTRA_SECONDS = 10;

interface UseJokerRow {
  coin_balance: number;
  /** Used only to pick fifty_fifty removals; never sent to the client. */
  correct_index: number;
  /** True when this exact joker was already used on the question (client retry); nothing was charged. */
  replayed: boolean;
}

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<UseJokerRequest>(req);
  if (!JOKER_KINDS.includes(body.kind)) throw new AppError("bad_request", "unknown joker kind");
  const kind: JokerKind = body.kind;
  const sessionId = requireUuid(body.session_id, "session_id");
  const questionId = requireUuid(body.question_id, "question_id");

  const { coin_balance, correct_index } = await callRpc<UseJokerRow>(adminClient(), "use_joker", {
    p_user_id: user.id,
    p_session_id: sessionId,
    p_question_id: questionId,
    p_kind: kind,
    p_cost: jokerCost(kind),
  });

  let res: UseJokerResponse;
  if (kind === "fifty_fifty") {
    // Deterministic per (session, question) so a replay (no second charge) returns the same pair.
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const remove_indices = await fiftyFiftyRemovals(correct_index, sessionId, questionId, secret);
    res = { kind, remove_indices, coin_balance };
  } else if (kind === "extra_time") {
    res = { kind, extra_seconds: EXTRA_SECONDS, coin_balance };
  } else {
    res = { kind, skipped: true, coin_balance };
  }
  return json(res);
}));
