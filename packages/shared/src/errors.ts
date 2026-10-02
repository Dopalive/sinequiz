export type ErrorCode =
  | "insufficient_coins"
  | "session_not_found"
  | "session_finished"
  | "question_not_in_session"
  | "already_answered"
  | "no_questions"
  | "joker_already_used"
  | "title_not_found"
  | "unauthorized"
  | "bad_request";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  insufficient_coins: 402,
  session_not_found: 404,
  session_finished: 409,
  question_not_in_session: 400,
  already_answered: 409,
  no_questions: 404,
  joker_already_used: 409,
  title_not_found: 404,
  unauthorized: 401,
  bad_request: 400,
};
