// Catalog reads go straight to PostgREST under RLS: titles, translations and the per-locale
// question counts are public; the questions table itself is unreadable from the client.
import type { Locale } from "./i18n";
import { supabase } from "./supabase";

export const MIN_QUESTIONS = 10;

export interface TitleSummary {
  id: string;
  slug: string;
  kind: "series" | "movie";
  release_year: number | null;
  poster_url: string | null;
  name: string;
  synopsis: string | null;
  active_questions: number;
}

export interface TitleDetail extends TitleSummary {
  seasons: number[];
}

interface TitleRow {
  id: string;
  slug: string;
  kind: "series" | "movie";
  release_year: number | null;
  poster_url: string | null;
  title_translations: { locale: string; name: string; synopsis: string | null }[];
  title_question_counts: { locale: string; active_questions: number }[];
}

function pickTranslation(rows: TitleRow["title_translations"], locale: Locale) {
  return rows.find((t) => t.locale === locale) ?? rows.find((t) => t.locale === "en") ?? rows[0] ?? null;
}

function toSummary(row: TitleRow, locale: Locale): TitleSummary | null {
  const count = row.title_question_counts.find((c) => c.locale === locale)?.active_questions ?? 0;
  const tr = pickTranslation(row.title_translations, locale);
  if (!tr) return null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    release_year: row.release_year,
    poster_url: row.poster_url,
    name: tr.name,
    synopsis: tr.synopsis,
    active_questions: count,
  };
}

const SELECT = "id, slug, kind, release_year, poster_url, title_translations(locale, name, synopsis), title_question_counts(locale, active_questions)";

/** Titles playable in `locale` (spec §6: < 10 active questions in that language → hidden). */
export async function fetchTitles(locale: Locale): Promise<TitleSummary[]> {
  const { data, error } = await supabase.from("titles").select(SELECT).eq("is_active", true).order("release_year", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as TitleRow[])
    .map((row) => toSummary(row, locale))
    .filter((t): t is TitleSummary => t !== null && t.active_questions >= MIN_QUESTIONS);
}

export async function fetchTitle(id: string, locale: Locale): Promise<TitleDetail | null> {
  const [{ data, error }, { data: eps, error: epErr }] = await Promise.all([
    supabase.from("titles").select(SELECT).eq("id", id).maybeSingle(),
    supabase.from("episodes").select("season").eq("title_id", id).gt("season", 0),
  ]);
  if (error) throw error;
  if (epErr) throw epErr;
  if (!data) return null;
  const summary = toSummary(data as unknown as TitleRow, locale);
  if (!summary) return null;
  const seasons = [...new Set(((eps ?? []) as { season: number }[]).map((e) => e.season))].sort((a, b) => a - b);
  return { ...summary, seasons };
}
