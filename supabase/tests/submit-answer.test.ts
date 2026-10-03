import { describe, it, expect } from "vitest";
import { callFn, newUser, adminClient, balance, SEED } from "./helpers.ts";
import type { StartSessionResponse, SubmitAnswerResponse, ApiError } from "@sinequiz/shared";

async function start(token: string) {
  const r = await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId }, token);
  return r.body;
}
async function correctIndex(questionId: string): Promise<number> {
  const { data } = await adminClient().from("questions").select("correct_index").eq("id", questionId).single();
  return data!.correct_index;
}

describe("submit-answer", () => {
  it("awards coins for a correct answer and reveals correct_index", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const ci = await correctIndex(q.id);
    const r = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: ci }, token);
    expect(r.status).toBe(200);
    expect(r.body.is_correct).toBe(true);
    expect(r.body.correct_index).toBe(ci);
    expect(r.body.coins_earned).toBe(q.difficulty === 3 ? 15 : 10);
    expect(r.body.coin_balance).toBe(100 + r.body.coins_earned);
    expect(await balance(userId)).toBe(r.body.coin_balance);
  });

  it("gives no coins for a wrong or timed-out answer", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const [q1, q2] = [s.questions[0]!, s.questions[1]!];
    const wrong = (await correctIndex(q1.id) + 1) % 4;
    const r1 = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q1.id, chosen_index: wrong }, token);
    expect(r1.body.is_correct).toBe(false);
    expect(r1.body.coins_earned).toBe(0);
    const r2 = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q2.id, chosen_index: null }, token);
    expect(r2.body.is_correct).toBe(false);
    expect(r2.body.coin_balance).toBe(100);
  });

  it("is idempotent: a repeat returns the stored result and does not pay twice", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const ci = await correctIndex(q.id);
    const first = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: ci }, token);
    const again = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: (ci + 1) % 4 }, token);
    expect(again.status).toBe(200);
    expect(again.body.is_correct).toBe(true);
    expect(again.body.coins_earned).toBe(0);
    expect(again.body.coin_balance).toBe(first.body.coin_balance);
    expect(await balance(userId)).toBe(first.body.coin_balance);
    const { data } = await adminClient().from("coin_ledger").select("id").eq("user_id", userId).eq("reason", "correct_answer");
    expect(data).toHaveLength(1);
  });

  it("rejects a question not in the session and foreign sessions", async () => {
    const a = await newUser();
    const b = await newUser();
    const sa = await start(a.token);
    const sb = await start(b.token);
    const notMine = sb.questions.find((q) => !sa.questions.some((x) => x.id === q.id)) ?? sb.questions[0]!;
    const r1 = await callFn<ApiError>("submit-answer", { session_id: sa.session_id, question_id: "00000000-0000-0000-0000-00000000beef", chosen_index: 0 }, a.token);
    expect(r1.body.error).toBe("question_not_in_session");
    const r2 = await callFn<ApiError>("submit-answer", { session_id: sb.session_id, question_id: notMine.id, chosen_index: 0 }, a.token);
    expect(r2.status).toBe(404);
    expect(r2.body.error).toBe("session_not_found");
  });

  it("rejects an invalid chosen_index", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const r = await callFn<ApiError>("submit-answer", { session_id: s.session_id, question_id: s.questions[0]!.id, chosen_index: 7 }, token);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_request");
  });

  it("rejects a missing chosen_index", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const r = await callFn<ApiError>("submit-answer", { session_id: s.session_id, question_id: s.questions[0]!.id }, token);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_request");
  });

  it("rejects a JSON null body", async () => {
    const { token } = await newUser();
    const r = await callFn<ApiError>("submit-answer", null, token);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_request");
  });

  it("stores the joker used on the question with the answer", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const { error } = await adminClient().from("session_jokers").insert({ session_id: s.session_id, question_id: q.id, kind: "fifty_fifty" });
    expect(error).toBeNull();
    const r = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: 0 }, token);
    expect(r.status).toBe(200);
    const { data } = await adminClient().from("answers").select("joker_used").eq("session_id", s.session_id).eq("question_id", q.id).single();
    expect(data!.joker_used).toBe("fifty_fifty");
  });

  it("pays exactly once under concurrent identical submits", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const ci = await correctIndex(q.id);
    const award = q.difficulty === 3 ? 15 : 10;
    const body = { session_id: s.session_id, question_id: q.id, chosen_index: ci };
    const rs = await Promise.all([1, 2, 3, 4].map(() => callFn<SubmitAnswerResponse>("submit-answer", body, token)));
    for (const r of rs) {
      expect(r.status).toBe(200);
      expect(r.body.is_correct).toBe(true);
    }
    expect(rs.reduce((n, r) => n + r.body.coins_earned, 0)).toBe(award);
    const { data } = await adminClient().from("coin_ledger").select("id")
      .eq("user_id", userId).eq("reason", "correct_answer").eq("ref_id", q.id);
    expect(data).toHaveLength(1);
    expect(await balance(userId)).toBe(100 + award);
  });
});
