export const MAX_PROMPT_LENGTH = 200;
export const MAX_CHOICE_LENGTH = 60;
export const CHOICE_COUNT = 4;

export type FormatError =
  | "prompt_empty"
  | "prompt_too_long"
  | "choices_not_four"
  | "choice_empty"
  | "choice_too_long"
  | "choices_duplicate"
  | "correct_index_out_of_range";

/** Returns a list of format violations; an empty list means the question is well-formed. */
export function validateQuestionFormat(q: {
  prompt: string;
  choices: unknown;
  correct_index: number;
}): FormatError[] {
  const errors: FormatError[] = [];
  const prompt = (q.prompt ?? "").trim();
  if (prompt.length === 0) errors.push("prompt_empty");
  if (prompt.length > MAX_PROMPT_LENGTH) errors.push("prompt_too_long");

  if (!Array.isArray(q.choices) || q.choices.length !== CHOICE_COUNT || !q.choices.every((c) => typeof c === "string")) {
    errors.push("choices_not_four");
  } else {
    const choices = q.choices as string[];
    const normalized = choices.map((c) => c.trim().toLowerCase());
    if (normalized.some((c) => c.length === 0)) errors.push("choice_empty");
    if (choices.some((c) => c.trim().length > MAX_CHOICE_LENGTH)) errors.push("choice_too_long");
    if (new Set(normalized).size !== normalized.length) errors.push("choices_duplicate");
  }

  if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= CHOICE_COUNT) {
    errors.push("correct_index_out_of_range");
  }
  return errors;
}
