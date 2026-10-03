# Question content

Authored quiz content lives here as one JSON file per title in
`content/titles/<slug>.json`. A script validates the files and upserts them into
Supabase (tables `titles`, `title_translations`, `episodes`, `questions`).

## File format

```json
{
  "slug": "fleabag",
  "kind": "series",
  "release_year": 2016,
  "tmdb_id": null,
  "poster_url": null,
  "translations": {
    "en": { "name": "Fleabag", "synopsis": "..." },
    "tr": { "name": "Fleabag", "synopsis": "..." }
  },
  "episodes": [{ "season": 1, "number": 1 }],
  "questions": [
    {
      "locale": "en",
      "season": 1,
      "episode": 1,
      "prompt": "...",
      "choices": ["...", "...", "...", "..."],
      "correct_index": 2,
      "difficulty": 2,
      "source_ref": "ai:claude-sonnet-5-5:2026-10-03"
    }
  ]
}
```

- `slug` must equal the file name (without `.json`). `kind` is `series` or `movie`.
- `translations` needs both `tr` and `en` with a non-empty `name` (use the local
  release title where one exists, e.g. `Parasite` -> `Parazit`).
- `episodes` is optional and for series only. `season` / `episode` on a question
  are optional, must be set together, and must reference an entry in `episodes`
  (the loader resolves them to `episode_id`). Omit them for title-level questions;
  tag an episode only when you are sure the fact belongs to it. Movies have no
  episodes.
- `source_ref` of authored questions always starts with `ai:`.

## Rules (enforced by `content:validate`)

Per question: format rules from `packages/shared/src/questionFormat.ts` (prompt
at most 200 chars, exactly 4 distinct non-empty string choices of at most 60
chars, `correct_index` 0-3), `difficulty` 1-3 (1 = casual viewer, 2 = attentive
viewer, 3 = fan detail), `locale` in `tr` / `en`.

Per title and locale:

- at least 40 questions;
- no single `correct_index` above 40% of the questions;
- each difficulty (1, 2, 3) between 20% and 50%;
- no duplicate prompts (case-insensitive).

Authoring guidelines: only facts you are certain of, distractors that are
plausible entities from the same title, exactly one defensible answer, no
"all/none of the above". Turkish questions are written natively, not translated
word for word.

## Commands

```sh
pnpm content:validate                       # validate every file, print a summary table
pnpm content:load                           # validate, then upsert into the local stack
pnpm content:load --only fleabag,dark       # only some slugs
pnpm content:load --dry-run                 # validate and print what would be loaded
pnpm content:load --retire-seed             # also deactivate seed:* questions of loaded titles
```

The loader reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
environment; when they are absent it falls back to `pnpm supabase status -o env`
(`API_URL`, `SERVICE_ROLE_KEY`), i.e. the local stack.

### Against a hosted project

```sh
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service role key> \
pnpm content:load --retire-seed
```

The service role key bypasses RLS; never commit it or put it in the app.

## Reload semantics

- Title rows are upserted by `slug` (the id is kept; kind, year, `tmdb_id` and
  `poster_url` are updated). Translations are upserted by `(title_id, locale)`,
  episodes by `(title_id, season, number)`.
- For every locale present in a file, the title's existing questions whose
  `source_ref like 'ai:%'` are deleted and the file's questions are inserted. So
  `ai:` questions are replaced wholesale on every reload, and re-running the
  loader is idempotent. Edit the JSON, not the database.
- `seed:` rows (the placeholder data in `supabase/seed.sql`) are never deleted.
  They are only deactivated (`is_active = false`) when `--retire-seed` is passed,
  and only for the titles being loaded.
- Questions with other `source_ref` prefixes (for example pipeline output) are
  left untouched.

## Testlerle ilişkisi

`supabase/tests` entegrasyon testleri `supabase/seed.sql`'in saf halini varsayar (Breaking Bad için 30 placeholder soru).
`content:load --retire-seed` çalıştırılmış bir lokal DB'de bu testler bozulur; testten önce `pnpm supabase db reset`
yap, oyun için tekrar `pnpm content:load --retire-seed` çalıştır.
