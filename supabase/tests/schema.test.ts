import { describe, it, expect } from "vitest";
import { anonClient, adminClient, newUser, balance, SEED } from "./helpers.ts";

describe("content schema", () => {
  it("exposes questions_public without correct_index or source_ref", async () => {
    const { data, error } = await anonClient().from("questions_public").select("*").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0]!;
    expect(row).not.toHaveProperty("correct_index");
    expect(row).not.toHaveProperty("source_ref");
    expect(row).toHaveProperty("choices");
  });

  it("blocks anon access to the raw questions table", async () => {
    const { error } = await anonClient().from("questions").select("correct_index").limit(1);
    expect(error).not.toBeNull();
  });

  it("seeds 30 active questions per locale for the seed title", async () => {
    const { data, error } = await anonClient()
      .from("title_question_counts").select("*").eq("title_id", SEED.titleId);
    expect(error).toBeNull();
    const byLocale = Object.fromEntries(data!.map((r) => [r.locale, r.active_questions]));
    expect(byLocale).toEqual({ en: 30, tr: 30 });
  });

  it("lists the seed title and translations", async () => {
    const { data } = await anonClient().from("titles").select("slug, title_translations(locale, name)").eq("id", SEED.titleId).single();
    expect(data!.slug).toBe("breaking-bad");
    expect((data as any).title_translations).toHaveLength(2);
  });
});

describe("game schema", () => {
  it("creates a profile with 100 welcome coins for a new anonymous user", async () => {
    const { client, userId } = await newUser();
    const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
    expect(error).toBeNull();
    expect(data!.coin_balance).toBe(100);
    expect(data!.locale).toBe("en");
    const { data: ledger } = await client.from("coin_ledger").select("delta, reason").eq("user_id", userId);
    expect(ledger).toEqual([{ delta: 100, reason: "welcome" }]);
  });

  it("lets a user update own locale but not coin_balance", async () => {
    const { client, userId } = await newUser();
    const { error: ok } = await client.from("profiles").update({ locale: "tr" }).eq("id", userId);
    expect(ok).toBeNull();
    await client.from("profiles").update({ coin_balance: 999999 }).eq("id", userId);
    expect(await balance(userId)).toBe(100);
  });

  it("keeps coin_balance in sync with the ledger and refuses to go negative", async () => {
    const { userId } = await newUser();
    const admin = adminClient();
    const { error: e1 } = await admin.from("coin_ledger").insert({ user_id: userId, delta: -60, reason: "test" });
    expect(e1).toBeNull();
    expect(await balance(userId)).toBe(40);
    const { error: e2 } = await admin.from("coin_ledger").insert({ user_id: userId, delta: -50, reason: "test" });
    expect(e2).not.toBeNull();
    expect(await balance(userId)).toBe(40);
  });

  it("hides other users' profiles and ledgers", async () => {
    const a = await newUser();
    const b = await newUser();
    const { data } = await a.client.from("profiles").select("id").eq("id", b.userId);
    expect(data).toEqual([]);
    const { data: ledger } = await a.client.from("coin_ledger").select("id").eq("user_id", b.userId);
    expect(ledger).toEqual([]);
  });

  it("deactivates a question after 3 reports", async () => {
    const admin = adminClient();
    const { data: q } = await admin.from("questions").insert({
      title_id: SEED.titleId, locale: "en", prompt: "report me", choices: ["a", "b", "c", "d"], correct_index: 0, difficulty: 1,
    }).select("id").single();
    for (let i = 0; i < 3; i++) {
      const u = await newUser();
      const { error } = await u.client.from("question_reports").insert({ question_id: q!.id, reason: "wrong" });
      expect(error).toBeNull();
    }
    const { data: after } = await admin.from("questions").select("is_active, report_count").eq("id", q!.id).single();
    expect(after).toEqual({ is_active: false, report_count: 3 });
    const { data: pub } = await anonClient().from("questions_public").select("id").eq("id", q!.id);
    expect(pub).toEqual([]);
  });

  it("does not let a user insert their own session or answers directly", async () => {
    const { client, userId } = await newUser();
    const { error } = await client.from("quiz_sessions").insert({ user_id: userId, title_id: SEED.titleId, locale: "en", question_ids: [] });
    expect(error).not.toBeNull();
  });
});
