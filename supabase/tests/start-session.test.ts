import { describe, it, expect } from "vitest";
import { callFn, newUser, adminClient, SEED } from "./helpers.ts";
import type { StartSessionResponse, ApiError } from "@sinequiz/shared";

describe("start-session", () => {
  it("rejects missing auth", async () => {
    const r = await callFn<ApiError>("start-session", { title_id: SEED.titleId }, null);
    expect(r.status).toBe(401);
  });

  it("starts a 10-question session in the user's locale without leaking answers", async () => {
    const { token, userId } = await newUser("tr");
    const r = await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId }, token);
    expect(r.status).toBe(200);
    expect(r.body.locale).toBe("tr");
    expect(r.body.questions).toHaveLength(10);
    for (const q of r.body.questions) {
      expect(q).not.toHaveProperty("correct_index");
      expect(q.choices).toHaveLength(4);
      expect(q.prompt.startsWith("tr ")).toBe(true);
    }
    const diffs = r.body.questions.map((q) => q.difficulty);
    expect(diffs.filter((d) => d === 1)).toHaveLength(3);
    expect(diffs.filter((d) => d === 2)).toHaveLength(4);
    expect(diffs.filter((d) => d === 3)).toHaveLength(3);
    const { data } = await adminClient().from("quiz_sessions").select("*").eq("id", r.body.session_id).single();
    expect(data!.user_id).toBe(userId);
    expect(data!.question_ids).toHaveLength(10);
    expect(data!.status).toBe("in_progress");
  });

  it("filters by season through episodes", async () => {
    const { token } = await newUser();
    const r = await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId, season: 1 }, token);
    expect(r.status).toBe(200);
    expect(r.body.questions).toHaveLength(10);
    const r2 = await callFn<ApiError>("start-session", { title_id: SEED.titleId, season: 9 }, token);
    expect(r2.status).toBe(404);
    expect(r2.body.error).toBe("no_questions");
  });

  it("returns title_not_found for an unknown title", async () => {
    const { token } = await newUser();
    const r = await callFn<ApiError>("start-session", { title_id: "00000000-0000-0000-0000-00000000dead" }, token);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("title_not_found");
  });

  it("excludes questions the user answered correctly in the last 30 days", async () => {
    const { token, userId } = await newUser();
    const admin = adminClient();
    // Mark 25 of the 30 en questions as correctly answered in a fake finished session.
    const { data: qs } = await admin.from("questions").select("id").eq("title_id", SEED.titleId).eq("locale", "en").limit(25);
    const ids = qs!.map((q) => q.id);
    const { data: s } = await admin.from("quiz_sessions").insert({ user_id: userId, title_id: SEED.titleId, locale: "en", question_ids: ids, status: "finished" }).select("id").single();
    await admin.from("answers").insert(ids.map((id) => ({ session_id: s!.id, question_id: id, chosen_index: 0, is_correct: true })));
    const r = await callFn<StartSessionResponse>("start-session", { title_id: SEED.titleId }, token);
    expect(r.status).toBe(200);
    expect(r.body.questions).toHaveLength(5);
    for (const q of r.body.questions) expect(ids).not.toContain(q.id);
  });

  it("abandons stale in_progress sessions older than 24h", async () => {
    const { token, userId } = await newUser();
    const admin = adminClient();
    const { data: stale } = await admin.from("quiz_sessions").insert({
      user_id: userId, title_id: SEED.titleId, locale: "en", question_ids: [],
      started_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    }).select("id").single();
    await callFn("start-session", { title_id: SEED.titleId }, token);
    const { data } = await admin.from("quiz_sessions").select("status").eq("id", stale!.id).single();
    expect(data!.status).toBe("abandoned");
  });
});
