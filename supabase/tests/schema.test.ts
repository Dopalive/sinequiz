import { describe, it, expect } from "vitest";
import { anonClient, SEED } from "./helpers.ts";

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
