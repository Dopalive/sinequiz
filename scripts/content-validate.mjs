// Validates content/titles/*.json. Exits non-zero on any violation.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateQuestionFormat } from "../packages/shared/src/questionFormat.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TITLES_DIR = join(ROOT, "content", "titles");
const LOCALES = ["tr", "en"];
const MIN_PER_LOCALE = 40;
const MAX_INDEX_SHARE = 0.4;

export function loadTitleFiles(only) {
  return readdirSync(TITLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !only || only.includes(f.replace(/\.json$/, "")))
    .sort()
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(TITLES_DIR, f), "utf8")) }));
}

export function validateAll(only) {
  const errors = [];
  const rows = [];
  for (const { file, data: t } of loadTitleFiles(only)) {
    const err = (m) => errors.push(`${file}: ${m}`);
    const slug = file.replace(/\.json$/, "");
    if (t.slug !== slug) err(`slug "${t.slug}" must equal filename "${slug}"`);
    if (!["series", "movie"].includes(t.kind)) err(`bad kind ${t.kind}`);
    if (t.release_year != null && !Number.isInteger(t.release_year)) err("release_year must be integer or null");
    if (t.tmdb_id != null && !Number.isInteger(t.tmdb_id)) err("tmdb_id must be integer or null");
    if (t.poster_url != null && typeof t.poster_url !== "string") err("poster_url must be string or null");
    const tr = t.translations ?? {};
    for (const l of LOCALES) {
      if (!tr[l] || typeof tr[l].name !== "string" || !tr[l].name.trim()) err(`translations.${l}.name missing`);
      else if (tr[l].synopsis != null && typeof tr[l].synopsis !== "string") err(`translations.${l}.synopsis must be string`);
    }
    for (const l of Object.keys(tr)) if (!LOCALES.includes(l)) err(`unknown translation locale ${l}`);
    const eps = new Set();
    for (const e of t.episodes ?? []) {
      if (!Number.isInteger(e.season) || !Number.isInteger(e.number)) err(`bad episode ${JSON.stringify(e)}`);
      const k = `${e.season}x${e.number}`;
      if (eps.has(k)) err(`duplicate episode ${k}`);
      eps.add(k);
    }
    if (t.kind === "movie" && (t.episodes?.length ?? 0) > 0) err("movies must not have episodes");
    if (!Array.isArray(t.questions)) { err("questions must be an array"); continue; }
    const groups = {};
    t.questions.forEach((q, i) => {
      const at = `questions[${i}]`;
      if (!LOCALES.includes(q.locale)) { err(`${at}: bad locale ${q.locale}`); return; }
      const g = (groups[q.locale] ??= { n: 0, idx: [0, 0, 0, 0], diff: { 1: 0, 2: 0, 3: 0 }, seen: new Set() });
      g.n++;
      if (typeof q.prompt !== "string") { err(`${at}: prompt not string`); return; }
      for (const e of validateQuestionFormat(q)) err(`${at} (${q.locale}): ${e}: ${q.prompt.slice(0, 50)}`);
      if (![1, 2, 3].includes(q.difficulty)) err(`${at}: difficulty must be 1-3`);
      else g.diff[q.difficulty]++;
      if (Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < 4) g.idx[q.correct_index]++;
      if (typeof q.source_ref !== "string" || !q.source_ref.startsWith("ai:")) err(`${at}: source_ref must start with "ai:"`);
      if ((q.season != null) !== (q.episode != null)) err(`${at}: season and episode must both be set or both omitted`);
      else if (q.season != null && !eps.has(`${q.season}x${q.episode}`)) err(`${at}: references unlisted episode ${q.season}x${q.episode}`);
      const key = q.prompt.trim().toLowerCase();
      if (g.seen.has(key)) err(`${at} (${q.locale}): duplicate prompt: ${q.prompt.slice(0, 50)}`);
      g.seen.add(key);
    });
    for (const l of LOCALES) {
      const g = groups[l];
      if (!g) { err(`no questions for locale ${l}`); continue; }
      if (g.n < MIN_PER_LOCALE) err(`${l}: only ${g.n} questions (min ${MIN_PER_LOCALE})`);
      const maxShare = Math.max(...g.idx) / g.n;
      if (maxShare > MAX_INDEX_SHARE) err(`${l}: correct_index skewed ${g.idx.join("/")}`);
      for (const d of [1, 2, 3]) {
        const s = g.diff[d] / g.n;
        if (s < 0.2 || s > 0.5) err(`${l}: difficulty ${d} share ${(s * 100).toFixed(0)}% outside 20-50%`);
      }
      rows.push({ title: t.slug, locale: l, questions: g.n, "idx 0/1/2/3": g.idx.join("/"), "diff 1/2/3": `${g.diff[1]}/${g.diff[2]}/${g.diff[3]}` });
    }
  }
  return { errors, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, rows } = validateAll();
  console.table(rows);
  if (errors.length) {
    console.error(`\n${errors.length} violation(s):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`OK: ${rows.length} title/locale sets valid`);
}
