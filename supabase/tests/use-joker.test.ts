import { describe, it, expect } from "vitest";
import { callFn, newUser, adminClient, balance, SEED } from "./helpers.ts";
import type { StartSessionResponse, UseJokerResponse, SubmitAnswerResponse, ApiError } from "@sinequiz/shared";

async function start(token: string) {
  return (await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId }, token)).body;
}
async function correctIndex(questionId: string): Promise<number> {
  const { data } = await adminClient().from("questions").select("correct_index").eq("id", questionId).single();
  return data!.correct_index;
}

describe("use-joker", () => {
  it("fifty_fifty removes two wrong choices and costs 30", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const ci = await correctIndex(q.id);
    const r = await callFn<UseJokerResponse>("use-joker", { session_id: s.session_id, question_id: q.id, kind: "fifty_fifty" }, token);
    expect(r.status).toBe(200);
    if (r.body.kind !== "fifty_fifty") throw new Error("wrong kind");
    expect(r.body.remove_indices).toHaveLength(2);
    expect(r.body.remove_indices).not.toContain(ci);
    expect(new Set(r.body.remove_indices).size).toBe(2);
    expect(r.body.coin_balance).toBe(70);
    expect(await balance(userId)).toBe(70);
  });

  it("extra_time costs 20 and returns 10 seconds", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const r = await callFn<UseJokerResponse>("use-joker", { session_id: s.session_id, question_id: s.questions[0]!.id, kind: "extra_time" }, token);
    expect(r.body).toEqual({ kind: "extra_time", extra_seconds: 10, coin_balance: 80 });
  });

  it("skip costs 40, closes the question, and the answer is then a replay", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const r = await callFn<UseJokerResponse>("use-joker", { session_id: s.session_id, question_id: q.id, kind: "skip" }, token);
    expect(r.body).toEqual({ kind: "skip", skipped: true, coin_balance: 60 });
    const { data } = await adminClient().from("answers").select("chosen_index, is_correct, joker_used").eq("session_id", s.session_id).eq("question_id", q.id).single();
    expect(data).toEqual({ chosen_index: null, is_correct: false, joker_used: "skip" });
    const ci = await correctIndex(q.id);
    const again = await callFn<SubmitAnswerResponse>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: ci }, token);
    expect(again.body.is_correct).toBe(false);
    expect(again.body.coins_earned).toBe(0);
  });

  it("allows only one joker per question", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    await callFn("use-joker", { session_id: s.session_id, question_id: q.id, kind: "extra_time" }, token);
    const r = await callFn<ApiError>("use-joker", { session_id: s.session_id, question_id: q.id, kind: "fifty_fifty" }, token);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("joker_already_used");
  });

  it("refuses a joker on an already answered question", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    await callFn("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: 0 }, token);
    const r = await callFn<ApiError>("use-joker", { session_id: s.session_id, question_id: q.id, kind: "extra_time" }, token);
    expect(r.body.error).toBe("already_answered");
  });

  it("refuses when coins are insufficient and leaves balance untouched", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    // 100 -> 60 -> 20; third skip (40) must fail.
    await callFn("use-joker", { session_id: s.session_id, question_id: s.questions[0]!.id, kind: "skip" }, token);
    await callFn("use-joker", { session_id: s.session_id, question_id: s.questions[1]!.id, kind: "skip" }, token);
    const r = await callFn<ApiError>("use-joker", { session_id: s.session_id, question_id: s.questions[2]!.id, kind: "skip" }, token);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("insufficient_coins");
    expect(await balance(userId)).toBe(20);
    const { data } = await adminClient().from("session_jokers").select("question_id").eq("session_id", s.session_id);
    expect(data).toHaveLength(2);
  });

  it("rejects an unknown kind", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const r = await callFn<ApiError>("use-joker", { session_id: s.session_id, question_id: s.questions[0]!.id, kind: "wallhack" }, token);
    expect(r.status).toBe(400);
  });
});
