import { describe, it, expect } from "vitest";
import { validateQuestionFormat } from "./questionFormat.ts";

const good = { prompt: "Who cooks with Walter?", choices: ["Jesse", "Hank", "Saul", "Mike"], correct_index: 0 };

describe("validateQuestionFormat", () => {
  it("accepts a well-formed question", () => {
    expect(validateQuestionFormat(good)).toEqual([]);
  });
  it("rejects non-array or wrong-length choices", () => {
    expect(validateQuestionFormat({ ...good, choices: "x" })).toContain("choices_not_four");
    expect(validateQuestionFormat({ ...good, choices: ["a", "b", "c"] })).toContain("choices_not_four");
  });
  it("rejects duplicate choices (case/whitespace-insensitive)", () => {
    expect(validateQuestionFormat({ ...good, choices: ["Jesse", " jesse ", "Saul", "Mike"] })).toContain("choices_duplicate");
  });
  it("rejects empty or too-long prompt", () => {
    expect(validateQuestionFormat({ ...good, prompt: "  " })).toContain("prompt_empty");
    expect(validateQuestionFormat({ ...good, prompt: "x".repeat(201) })).toContain("prompt_too_long");
  });
  it("rejects empty or too-long choices", () => {
    expect(validateQuestionFormat({ ...good, choices: ["", "b", "c", "d"] })).toContain("choice_empty");
    expect(validateQuestionFormat({ ...good, choices: ["x".repeat(61), "b", "c", "d"] })).toContain("choice_too_long");
  });
  it("rejects out-of-range correct_index", () => {
    expect(validateQuestionFormat({ ...good, correct_index: 4 })).toContain("correct_index_out_of_range");
    expect(validateQuestionFormat({ ...good, correct_index: -1 })).toContain("correct_index_out_of_range");
    expect(validateQuestionFormat({ ...good, correct_index: 1.5 })).toContain("correct_index_out_of_range");
  });
});
