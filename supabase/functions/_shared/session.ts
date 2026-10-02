import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./http.ts";

export interface SessionRow {
  id: string;
  user_id: string;
  title_id: string;
  locale: string;
  question_ids: string[];
  status: "in_progress" | "finished" | "abandoned";
  score: number;
}

/** Loads a session owned by `userId`; throws session_not_found / session_finished. */
export async function loadOwnedSession(admin: SupabaseClient, sessionId: string, userId: string): Promise<SessionRow> {
  if (!sessionId) throw new AppError("bad_request", "session_id required");
  const { data, error } = await admin
    .from("quiz_sessions")
    .select("id, user_id, title_id, locale, question_ids, status, score")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("session_not_found");
  if (data.status !== "in_progress") throw new AppError("session_finished");
  return data as SessionRow;
}

export function assertQuestionInSession(session: SessionRow, questionId: string): void {
  if (!questionId || !session.question_ids.includes(questionId)) {
    throw new AppError("question_not_in_session");
  }
}
