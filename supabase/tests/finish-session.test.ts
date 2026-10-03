import { describe, it, expect } from "vitest";
import { callFn, newUser, adminClient, balance, SEED } from "./helpers.ts";
import type { StartSessionResponse, FinishSessionResponse, ApiError } from "@sinequiz/shared";

async function start(token: string) {
  return (await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId }, token)).body;
}
async function answerAll(token: string, s: StartSessionResponse, correct: boolean) {
  let earned = 0;
  for (const q of s.questions) {
    const { data } = await adminClient().from("questions").select("correct_index").eq("id", q.id).single();
    const ci = correct ? data!.correct_index : (data!.correct_index + 1) % 4;
    const r = await callFn<{ coins_earned: number }>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: ci }, token);
    earned += r.body.coins_earned;
  }
  return earned;
}

describe("finish-session", () => {
  it("pays finish + perfect bonus for 10/10 and marks the session finished", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const earned = await answerAll(token, s, true);
    const r = await callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ score: 10, total: 10, coins_earned: 70, coin_balance: 100 + earned + 70 });
    expect(await balance(userId)).toBe(r.body.coin_balance);
    const { data } = await adminClient().from("quiz_sessions").select("status, score, finished_at").eq("id", s.session_id).single();
    expect(data!.status).toBe("finished");
    expect(data!.score).toBe(10);
    expect(data!.finished_at).not.toBeNull();
  });

  it("pays only the finish bonus for an imperfect session and fills unanswered questions", async () => {
    const { token } = await newUser();
    const s = await start(token);
    // Answer 3 wrong, leave 7 unanswered.
    for (const q of s.questions.slice(0, 3)) {
      const { data } = await adminClient().from("questions").select("correct_index").eq("id", q.id).single();
      await callFn("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: (data!.correct_index + 1) % 4 }, token);
    }
    const r = await callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token);
    expect(r.body).toEqual({ score: 0, total: 10, coins_earned: 20, coin_balance: 120 });
    const { data: answers } = await adminClient().from("answers").select("chosen_index").eq("session_id", s.session_id);
    expect(answers).toHaveLength(10);
    expect(answers!.filter((a) => a.chosen_index === null)).toHaveLength(7);
  });

  it("is idempotent", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const first = await callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token);
    const again = await callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ...first.body, coins_earned: 0 });
    expect(await balance(userId)).toBe(first.body.coin_balance);
  });

  it("blocks answers after finishing", async () => {
    const { token } = await newUser();
    const s = await start(token);
    await callFn("finish-session", { session_id: s.session_id }, token);
    const r = await callFn<ApiError>("submit-answer", { session_id: s.session_id, question_id: s.questions[0]!.id, chosen_index: 0 }, token);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("session_finished");
  });

  it("rejects a foreign session", async () => {
    const a = await newUser();
    const b = await newUser();
    const s = await start(a.token);
    const r = await callFn<ApiError>("finish-session", { session_id: s.session_id }, b.token);
    expect(r.status).toBe(404);
  });

  it("pays the bonus exactly once under concurrent finishes", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const earned = await answerAll(token, s, true);
    const rs = await Promise.all([1, 2, 3, 4].map(() =>
      callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token)));
    for (const r of rs) {
      expect(r.status).toBe(200);
      expect(r.body.score).toBe(10);
      expect(r.body.total).toBe(10);
    }
    expect(rs.reduce((n, r) => n + r.body.coins_earned, 0)).toBe(70);
    const { data } = await adminClient().from("coin_ledger").select("id").eq("reason", "session_bonus").eq("ref_id", s.session_id);
    expect(data).toHaveLength(1);
    expect(await balance(userId)).toBe(100 + earned + 70);
    expect(Math.max(...rs.map((r) => r.body.coin_balance))).toBe(100 + earned + 70);
  });

  it("refuses to finish an abandoned session", async () => {
    const { token } = await newUser();
    const s = await start(token);
    const { error } = await adminClient().from("quiz_sessions").update({ status: "abandoned" }).eq("id", s.session_id);
    expect(error).toBeNull();
    const r = await callFn<ApiError>("finish-session", { session_id: s.session_id }, token);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("session_finished");
  });

  it("stays consistent when an answer races the finish", async () => {
    const { token, userId } = await newUser();
    const s = await start(token);
    const q = s.questions[0]!;
    const { data: qrow } = await adminClient().from("questions").select("correct_index").eq("id", q.id).single();
    const [fin, sub] = await Promise.all([
      callFn<FinishSessionResponse>("finish-session", { session_id: s.session_id }, token),
      callFn<{ coins_earned?: number; error?: string }>("submit-answer", { session_id: s.session_id, question_id: q.id, chosen_index: qrow!.correct_index }, token),
    ]);
    expect(fin.status).toBe(200);
    expect([200, 409]).toContain(sub.status);
    if (sub.status === 409) expect(sub.body.error).toBe("session_finished");
    const admin = adminClient();
    const { data: session } = await admin.from("quiz_sessions").select("status, score").eq("id", s.session_id).single();
    expect(session!.status).toBe("finished");
    const { data: answers } = await admin.from("answers").select("is_correct").eq("session_id", s.session_id);
    expect(answers).toHaveLength(10);
    expect(session!.score).toBe(answers!.filter((a) => a.is_correct).length);
    expect(fin.body.score).toBe(session!.score);
    const { data: bonus } = await admin.from("coin_ledger").select("id").eq("reason", "session_bonus").eq("ref_id", s.session_id);
    expect(bonus).toHaveLength(1);
    expect(await balance(userId)).toBe(100 + (sub.status === 200 ? sub.body.coins_earned! : 0) + fin.body.coins_earned);
  });
});
