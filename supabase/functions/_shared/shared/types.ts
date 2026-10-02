import type { Difficulty, JokerKind } from "./coins.ts";
import type { ErrorCode } from "./errors.ts";

/** Question shape the client is allowed to see (no correct_index, no source_ref). */
export interface PublicQuestion {
  id: string;
  prompt: string;
  choices: string[];
  difficulty: Difficulty;
}

export interface ApiError {
  error: ErrorCode;
  message?: string;
}

export interface StartSessionRequest {
  title_id: string;
  /** Series only: restrict to one season. Omit for whole title / movies. */
  season?: number;
}
export interface StartSessionResponse {
  session_id: string;
  locale: string;
  questions: PublicQuestion[];
}

export interface SubmitAnswerRequest {
  session_id: string;
  question_id: string;
  /** null = timed out */
  chosen_index: number | null;
}
export interface SubmitAnswerResponse {
  is_correct: boolean;
  correct_index: number;
  coins_earned: number;
  coin_balance: number;
}

export interface UseJokerRequest {
  session_id: string;
  question_id: string;
  kind: JokerKind;
}
export type UseJokerResponse =
  | { kind: "fifty_fifty"; remove_indices: [number, number]; coin_balance: number }
  | { kind: "extra_time"; extra_seconds: number; coin_balance: number }
  | { kind: "skip"; skipped: true; coin_balance: number };

export interface FinishSessionRequest {
  session_id: string;
}
export interface FinishSessionResponse {
  score: number;
  total: number;
  coins_earned: number;
  coin_balance: number;
}
