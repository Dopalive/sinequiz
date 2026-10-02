import { describe, it, expect } from "vitest";
import { COINS, coinsForAnswer, jokerCost, sessionBonus, JOKER_KINDS } from "./coins.ts";

describe("coinsForAnswer", () => {
  it("gives 10 for correct difficulty 1 and 2", () => {
    expect(coinsForAnswer(1, true)).toBe(10);
    expect(coinsForAnswer(2, true)).toBe(10);
  });
  it("gives 15 for correct difficulty 3", () => {
    expect(coinsForAnswer(3, true)).toBe(15);
  });
  it("gives 0 for wrong answers at any difficulty", () => {
    expect(coinsForAnswer(1, false)).toBe(0);
    expect(coinsForAnswer(3, false)).toBe(0);
  });
});

describe("jokerCost", () => {
  it("matches the spec table", () => {
    expect(jokerCost("fifty_fifty")).toBe(30);
    expect(jokerCost("extra_time")).toBe(20);
    expect(jokerCost("skip")).toBe(40);
  });
  it("lists every kind", () => {
    expect([...JOKER_KINDS].sort()).toEqual(["extra_time", "fifty_fifty", "skip"]);
  });
});

describe("sessionBonus", () => {
  it("gives finish bonus only when not perfect", () => {
    expect(sessionBonus(7, 10)).toBe(20);
    expect(sessionBonus(0, 10)).toBe(20);
  });
  it("adds perfect bonus when all correct", () => {
    expect(sessionBonus(10, 10)).toBe(70);
    expect(sessionBonus(4, 4)).toBe(70);
  });
  it("never grants perfect bonus for an empty session", () => {
    expect(sessionBonus(0, 0)).toBe(20);
  });
});

describe("COINS", () => {
  it("has the spec values", () => {
    expect(COINS).toEqual({
      CORRECT_EASY: 10, CORRECT_HARD: 15, SESSION_FINISH: 20, PERFECT_BONUS: 50,
      WELCOME: 100, JOKER_FIFTY_FIFTY: 30, JOKER_EXTRA_TIME: 20, JOKER_SKIP: 40,
    });
  });
});
