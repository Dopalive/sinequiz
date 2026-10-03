// Upserts content/titles/*.json into Supabase using the service role.
// Flags: --only slug,slug  --dry-run  --retire-seed
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { validateAll, loadTitleFiles } from "./content-validate.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
const dry = flag("--dry-run");
const retireSeed = flag("--retire-seed");

const { errors } = validateAll(only);
if (errors.length) {
  console.error("Validation failed; aborting load:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

let url = process.env.SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const out = execSync("pnpm supabase status -o env", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries(out.split("\n").map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  url ||= env.API_URL;
  key ||= env.SERVICE_ROLE_KEY;
}
if (!url || !key) { console.error("No Supabase credentials found."); process.exit(1); }
console.log(`Target: ${url}${dry ? " (dry run)" : ""}`);
const db = createClient(url, key, { auth: { persistSession: false } });
const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const files = loadTitleFiles(only);
if (only) for (const s of only) if (!files.some((f) => f.data.slug === s)) { console.error(`No file for --only slug ${s}`); process.exit(1); }

for (const { data: t } of files) {
  const perLocale = {};
  for (const q of t.questions) perLocale[q.locale] = (perLocale[q.locale] ?? 0) + 1;
  const summary = `${t.slug}: ${Object.entries(perLocale).map(([l, n]) => `${l}=${n}`).join(" ")} episodes=${t.episodes?.length ?? 0}`;
  if (dry) { console.log(`[dry] ${summary}`); continue; }

  const titleRow = { slug: t.slug, kind: t.kind, release_year: t.release_year ?? null, tmdb_id: t.tmdb_id ?? null, poster_url: t.poster_url ?? null };
  const title = ok(await db.from("titles").upsert(titleRow, { onConflict: "slug" }).select("id").single(), "title upsert");
  const tid = title.id;

  const trRows = Object.entries(t.translations).map(([locale, v]) => ({ title_id: tid, locale, name: v.name, synopsis: v.synopsis ?? null }));
  ok(await db.from("title_translations").upsert(trRows, { onConflict: "title_id,locale" }), "translations upsert");

  const epIds = new Map();
  if (t.episodes?.length) {
    const rows = t.episodes.map((e) => ({ title_id: tid, season: e.season, number: e.number }));
    const data = ok(await db.from("episodes").upsert(rows, { onConflict: "title_id,season,number" }).select("id,season,number"), "episodes upsert");
    for (const e of data) epIds.set(`${e.season}x${e.number}`, e.id);
  }

  let deleted = 0, inserted = 0;
  for (const locale of Object.keys(perLocale)) {
    const del = ok(await db.from("questions").delete().eq("title_id", tid).eq("locale", locale).like("source_ref", "ai:%").select("id"), "delete ai questions");
    deleted += del.length;
    const rows = t.questions.filter((q) => q.locale === locale).map((q) => ({
      title_id: tid,
      episode_id: q.season != null ? epIds.get(`${q.season}x${q.episode}`) : null,
      locale,
      prompt: q.prompt.trim(),
      choices: q.choices.map((c) => c.trim()),
      correct_index: q.correct_index,
      difficulty: q.difficulty,
      source_ref: q.source_ref,
    }));
    for (let i = 0; i < rows.length; i += 100) ok(await db.from("questions").insert(rows.slice(i, i + 100)), "insert questions");
    inserted += rows.length;
  }

  let retired = 0;
  if (retireSeed) {
    const r = ok(await db.from("questions").update({ is_active: false }).eq("title_id", tid).like("source_ref", "seed:%").eq("is_active", true).select("id"), "retire seed");
    retired = r.length;
  }
  console.log(`${summary} | deleted_ai=${deleted} inserted=${inserted}${retireSeed ? ` retired_seed=${retired}` : ""}`);
}
console.log("Done.");
