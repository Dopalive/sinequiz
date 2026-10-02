import { handle, json, readJson, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { pickQuestions } from "../_shared/shared/questionSelection.ts";
import type { Difficulty } from "../_shared/shared/coins.ts";
import type { StartSessionRequest, StartSessionResponse, PublicQuestion } from "../_shared/shared/types.ts";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<StartSessionRequest>(req);
  if (!body.title_id) throw new AppError("bad_request", "title_id required");
  const admin = adminClient();

  // Lazy cleanup of stale sessions.
  await admin.from("quiz_sessions")
    .update({ status: "abandoned", finished_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("status", "in_progress")
    .lt("started_at", new Date(Date.now() - STALE_AFTER_MS).toISOString());

  const { data: title } = await admin.from("titles").select("id").eq("id", body.title_id).eq("is_active", true).maybeSingle();
  if (!title) throw new AppError("title_not_found");

  const { data: profile } = await admin.from("profiles").select("locale").eq("id", user.id).single();
  const locale = profile?.locale ?? "en";

  // Questions the user got right recently.
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from("answers")
    .select("question_id, quiz_sessions!inner(user_id)")
    .eq("quiz_sessions.user_id", user.id)
    .eq("is_correct", true)
    .gte("answered_at", since);
  if (recentErr) throw recentErr;
  const exclude = new Set((recent ?? []).map((r) => r.question_id as string));

  let query = admin.from("questions")
    .select(body.season !== undefined ? "id, prompt, choices, difficulty, episodes!inner(season)" : "id, prompt, choices, difficulty")
    .eq("title_id", body.title_id).eq("locale", locale).eq("is_active", true);
  if (body.season !== undefined) query = query.eq("episodes.season", body.season);
  const { data: candidates, error: qErr } = await query;
  if (qErr) throw qErr;

  const pool = (candidates ?? [])
    .filter((q) => !exclude.has(q.id as string))
    .map((q) => ({ id: q.id as string, prompt: q.prompt as string, choices: q.choices as string[], difficulty: q.difficulty as Difficulty }));
  if (pool.length === 0) throw new AppError("no_questions");

  const picked = pickQuestions(pool);
  const { data: session, error: sErr } = await admin.from("quiz_sessions")
    .insert({ user_id: user.id, title_id: body.title_id, locale, question_ids: picked.map((q) => q.id) })
    .select("id").single();
  if (sErr) throw sErr;

  const questions: PublicQuestion[] = picked.map(({ id, prompt, choices, difficulty }) => ({ id, prompt, choices, difficulty }));
  const res: StartSessionResponse = { session_id: session.id, locale, questions };
  return json(res);
}));
