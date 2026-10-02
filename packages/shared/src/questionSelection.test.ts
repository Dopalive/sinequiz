import { describe, it, expect } from "vitest";
import { pickQuestions, SESSION_SIZE, DIFFICULTY_TARGETS } from "./questionSelection.ts";
import type { Difficulty } from "./coins.ts";

function make(n: number, difficulty: Difficulty, prefix = "q") {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${difficulty}-${i}`, difficulty }));
}
// deterministic rng: cycles through a fixed sequence
function seqRng(values: number[]) { let i = 0; return () => values[i++ % values.length]!; }

describe("pickQuestions", () => {
  it("returns 10 with 3/4/3 distribution when buckets are plentiful", () => {
    const pool = [...make(20, 1), ...make(20, 2), ...make(20, 3)];
    const out = pickQuestions(pool, { rng: seqRng([0.1, 0.7, 0.3]) });
    expect(out).toHaveLength(SESSION_SIZE);
    const count = (d: Difficulty) => out.filter((q) => q.difficulty === d).length;
    expect(count(1)).toBe(DIFFICULTY_TARGETS[1]);
    expect(count(2)).toBe(DIFFICULTY_TARGETS[2]);
    expect(count(3)).toBe(DIFFICULTY_TARGETS[3]);
  });

  it("fills from leftovers when a bucket is short", () => {
    const pool = [...make(1, 1), ...make(20, 2), ...make(20, 3)];
    const out = pickQuestions(pool, { rng: seqRng([0.5]) });
    expect(out).toHaveLength(10);
    expect(out.filter((q) => q.difficulty === 1)).toHaveLength(1);
  });

  it("returns everything when fewer than total exist", () => {
    const pool = [...make(2, 1), ...make(3, 2)];
    expect(pickQuestions(pool, { rng: seqRng([0.5]) })).toHaveLength(5);
  });

  it("never returns duplicates", () => {
    const pool = [...make(5, 1), ...make(5, 2), ...make(5, 3)];
    const out = pickQuestions(pool, { rng: seqRng([0.9, 0.2, 0.4, 0.6]) });
    expect(new Set(out.map((q) => q.id)).size).toBe(out.length);
  });

  it("respects a custom total", () => {
    const pool = [...make(5, 1), ...make(5, 2), ...make(5, 3)];
    expect(pickQuestions(pool, { total: 4, rng: seqRng([0.5]) })).toHaveLength(4);
  });

  it("returns empty for empty input", () => {
    expect(pickQuestions([], {})).toEqual([]);
  });
});

describe("pickQuestions quota allocation", () => {
  const plentiful = () => [...make(30, 1), ...make(30, 2), ...make(30, 3)];
  const counter = (out: { difficulty: Difficulty }[]) => (d: Difficulty) =>
    out.filter((q) => q.difficulty === d).length;

  it("total 5 uses largest-remainder quotas that sum to 5", () => {
    const out = pickQuestions(plentiful(), { total: 5, rng: seqRng([0.3, 0.8, 0.1]) });
    expect(out).toHaveLength(5);
    const count = counter(out);
    expect(count(2)).toBe(2);
    expect(count(1) + count(3)).toBe(3);
    // largest-remainder quotas for 5 are 2/2/1 (1.5/2/1.5, tie broken toward lower difficulty)
    expect(count(1)).toBeLessThanOrEqual(2);
    expect(count(3)).toBeLessThanOrEqual(2);
  });

  it("total 25 gives 10 of difficulty 2 and 15 split 8/7 across 1 and 3", () => {
    const out = pickQuestions(plentiful(), { total: 25, rng: seqRng([0.6, 0.2, 0.9]) });
    expect(out).toHaveLength(25);
    const count = counter(out);
    expect(count(1) + count(2) + count(3)).toBe(25);
    expect(count(2)).toBe(10);
    expect([count(1), count(3)].sort()).toEqual([7, 8]);
  });

  it("total 9 does not starve difficulty 3 (quotas 3/3/3)", () => {
    const out = pickQuestions(plentiful(), { total: 9, rng: seqRng([0.4, 0.75, 0.05]) });
    expect(out).toHaveLength(9);
    const count = counter(out);
    expect(count(1)).toBe(3);
    expect(count(2)).toBe(3);
    expect(count(3)).toBe(3);
  });

  it("returns a duplicated id within one bucket at most once", () => {
    const dup = { id: "dup", difficulty: 1 as Difficulty };
    const pool = [dup, { ...dup }, { ...dup }, ...make(1, 1), ...make(20, 2), ...make(20, 3)];
    const out = pickQuestions(pool, { rng: seqRng([0.5]) });
    expect(out).toHaveLength(10);
    expect(out.filter((q) => q.id === "dup")).toHaveLength(1);
    expect(new Set(out.map((q) => q.id)).size).toBe(out.length);
  });

  it("fills from leftovers while still meeting the 2 and 3 quotas", () => {
    const pool = [...make(1, 1), ...make(20, 2), ...make(20, 3)];
    const out = pickQuestions(pool, { rng: seqRng([0.5]) });
    expect(out).toHaveLength(10);
    const count = counter(out);
    expect(count(1)).toBe(1);
    expect(count(2)).toBeGreaterThanOrEqual(DIFFICULTY_TARGETS[2]);
    expect(count(3)).toBeGreaterThanOrEqual(DIFFICULTY_TARGETS[3]);
  });
});
