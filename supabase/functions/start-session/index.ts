import { handle, json, readJson, requireUuid, AppError } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { pickQuestions } from "../_shared/shared/questionSelection.ts";
import type { StartSessionRequest, StartSessionResponse, PublicQuestion } from "../_shared/shared/types.ts";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<StartSessionRequest>(req);
  if (!body.title_id) throw new AppError("bad_request", "title_id required");
  const titleId = requireUuid(body.title_id, "title_id");
  const season = body.season;
  if (season !== undefined && !(Number.isInteger(season) && season >= 0)) {
    throw new AppError("bad_request", "season must be a non-negative integer");
  }
  const admin = adminClient();

  // Lazy cleanup of stale sessions.
  const { error: staleErr } = await admin.from("quiz_sessions")
    .update({ status: "abandoned", finished_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("status", "in_progress")
    .lt("started_at", new Date(Date.now() - STALE_AFTER_MS).toISOString());
  if (staleErr) throw staleErr;

  const { data: title, error: titleErr } = await admin.from("titles").select("id").eq("id", titleId).eq("is_active", true).maybeSingle();
  if (titleErr) throw titleErr;
  if (!title) throw new AppError("title_not_found");

  const { data: profile, error: profileErr } = await admin.from("profiles").select("locale").eq("id", user.id).single();
  if (profileErr) throw profileErr;
  const locale = (profile.locale as string | null) ?? "en";

  // Questions of THIS title the user got right recently. Both this query and the candidate query below are
  // subject to PostgREST's max_rows (1000): a title is expected to stay below 1000 active questions per
  // locale, and scoping the exclusion set to the title keeps it bounded by that same number.
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from("answers")
    .select("question_id, quiz_sessions!inner(user_id), questions!inner(title_id)")
    .eq("quiz_sessions.user_id", user.id)
    .eq("questions.title_id", titleId)
    .eq("is_correct", true)
    .gte("answered_at", since);
  if (recentErr) throw recentErr;
  const exclude = new Set((recent ?? []).map((r) => r.question_id as string));

  // Widened to `string`: supabase-js cannot parse a conditional select literal; rows are typed below.
  const columns: string = season !== undefined
    ? "id, prompt, choices, difficulty, episodes!inner(season)"
    : "id, prompt, choices, difficulty";
  let query = admin.from("questions")
    .select(columns)
    .eq("title_id", titleId).eq("locale", locale).eq("is_active", true);
  if (season !== undefined) query = query.eq("episodes.season", season);
  const { data: candidates, error: qErr } = await query;
  if (qErr) throw qErr;

  const rows = (candidates ?? []) as unknown as PublicQuestion[];
  const pool = rows
    .filter((q) => !exclude.has(q.id))
    .map(({ id, prompt, choices, difficulty }) => ({ id, prompt, choices, difficulty }));
  if (pool.length === 0) throw new AppError("no_questions");

  const picked = pickQuestions(pool);
  const { data: session, error: sErr } = await admin.from("quiz_sessions")
    .insert({ user_id: user.id, title_id: titleId, locale, question_ids: picked.map((q) => q.id) })
    .select("id").single();
  if (sErr) throw sErr;

  const questions: PublicQuestion[] = picked.map(({ id, prompt, choices, difficulty }) => ({ id, prompt, choices, difficulty }));
  const res: StartSessionResponse = { session_id: session.id, locale, questions };
  return json(res);
}));
