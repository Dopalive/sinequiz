import { describe, it, expect } from "vitest";
import { ERROR_STATUS, type ErrorCode } from "./errors.ts";

describe("ERROR_STATUS", () => {
  it("maps every code to an HTTP status", () => {
    const codes: ErrorCode[] = [
      "insufficient_coins", "session_not_found", "session_finished",
      "question_not_in_session", "already_answered", "no_questions",
      "joker_already_used", "title_not_found", "unauthorized", "bad_request",
    ];
    for (const c of codes) expect(ERROR_STATUS[c]).toBeGreaterThanOrEqual(400);
    expect(ERROR_STATUS.unauthorized).toBe(401);
    expect(ERROR_STATUS.session_not_found).toBe(404);
    expect(ERROR_STATUS.insufficient_coins).toBe(402);
    expect(ERROR_STATUS.already_answered).toBe(409);
  });
});
