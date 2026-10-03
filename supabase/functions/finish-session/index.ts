import { handle, json, readJson, requireUuid } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { callRpc } from "../_shared/rpc.ts";
import { COINS } from "../_shared/shared/coins.ts";
import type { FinishSessionRequest, FinishSessionResponse } from "../_shared/shared/types.ts";

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<FinishSessionRequest>(req);
  const sessionId = requireUuid(body.session_id, "session_id");

  const row = await callRpc<FinishSessionResponse>(adminClient(), "finish_session", {
    p_user_id: user.id,
    p_session_id: sessionId,
    p_finish_bonus: COINS.SESSION_FINISH,
    p_perfect_bonus: COINS.PERFECT_BONUS,
  });
  const res: FinishSessionResponse = {
    score: row.score,
    total: row.total,
    coins_earned: row.coins_earned,
    coin_balance: row.coin_balance,
  };
  return json(res);
}));
