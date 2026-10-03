// The active game is mirrored in AsyncStorage so a killed app resumes at the same question
// (spec §7). The server stays the source of truth for correctness and coins; this is UI state.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PublicQuestion } from "@sinequiz/shared";

const KEY = "sinequiz.activeSession.v1";

export interface AnsweredQuestion {
  chosen_index: number | null;
  correct_index: number;
  is_correct: boolean;
  coins_earned: number;
  skipped: boolean;
}

export interface ActiveSession {
  session_id: string;
  title_id: string;
  title_name: string;
  season?: number;
  questions: PublicQuestion[];
  /** question id → result; a question is "open" until it has an entry here. */
  answers: Record<string, AnsweredQuestion>;
  started_at: number;
}

export async function loadActiveSession(): Promise<ActiveSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    // Sessions go stale server-side after 24h; drop them locally too.
    if (Date.now() - parsed.started_at > 24 * 3600 * 1000) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function nextOpenIndex(session: ActiveSession): number {
  const i = session.questions.findIndex((q) => !session.answers[q.id]);
  return i === -1 ? session.questions.length : i;
}
