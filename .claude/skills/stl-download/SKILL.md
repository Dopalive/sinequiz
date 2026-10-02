---
name: stl-download
description: Use when subtitle files (SRT/STL, "altyazı") for a TV series season or a movie must be fetched from the internet into the SineQuiz pipeline's data/subs/<slug>/ layout, or when a subtitle download attempt is stalling on provider errors, SSL errors, 403s, or hand-scraping subtitle sites.
argument-hint: "<slug> <Release.Title> S01 1 7  |  <slug> <Title.Year> movie"
---

# stl-download

Fetch SRT subtitles (EN + TR by default) for series episodes or a movie into
`data/subs/<slug>/` using **subliminal**, with no video file and no accounts.

**Core principle:** subliminal already searches the open providers that work
(addic7ed, opensubtitles, gestdown, …). The fix for "no subtitle found" is a
better *release name*, never a hand-written scraper.

## Steps

1. `which subliminal || uv tool install subliminal`
2. Run the helper from the repo root:
   ```bash
   .claude/skills/stl-download/fetch.sh breaking-bad "Breaking.Bad" S01 1 7
   .claude/skills/stl-download/fetch.sh inception "Inception.2010" movie
   .claude/skills/stl-download/fetch.sh dark "Dark.2017" S02 1 8 en,tr,de
   ```
   It builds release-style names (`Dark.2017.S02E01.1080p.WEB.x264.mkv`), queries
   one language at a time, retries each missing file under the other source
   tags (WEB, BluRay, HDTV, DVDRip), validates (`-->` cues, not HTML), strips
   BOM/CRLF and writes `data/subs/<slug>/S02E01.en.srt`. A `MISS` removes any
   file an earlier run left at that path.
3. Read the `OK`/`MISS` lines. Each `OK` shows the cue count; a few hundred
   cues per episode, 1000+ for a movie, is normal. The script rejects matches
   scoring under 60, which is where the series/title itself did not match.
4. Spot-check one EN and one TR file for **this show**: `grep -ci '<main character name>'`
   must be > 0, or the opening lines (`sed -n 20,30p`) must be from this title.
   Right language but wrong show means a bad title; go to "When a file is MISS".

## Release title rules

Try the plain title first; disambiguate only after a MISS.

| Case | Title to pass | Why |
|---|---|---|
| Plain show | `Breaking.Bad`, `Fleabag` | guessit parses dots as spaces |
| Title reused across shows/years | `Dark.2017`, `The.Office.US` | year/country disambiguates |
| Movie | `Inception.2010` | year is required for movies |
| Non-ASCII title | use the English release title | providers index release names |

## When a file is MISS

The script already tried every source tag. Re-run `fetch.sh` (it overwrites)
once per step, stop at the first full `OK`:

1. Add the year (`Show.2017`) or country (`The.Office.US`) to the title.
2. `PROVIDERS=ALL .claude/skills/stl-download/fetch.sh ...` (widens the provider list).
3. Still MISS: the language is not on open providers (common for local
   Turkish productions). Report the exact `MISS` lines as the outcome and stop. Do not curl-scrape subtitle sites,
   do not register accounts, do not debug a single provider's SSL/403 error.

## Noise to ignore

- `opensubtitlescom` discarded (needs an account; `fetch.sh` filters this line) — others still run.
- podnapisi `SSLCertVerificationError` / tvsubtitles `403` / omdb `401` — one provider down, results come from the rest.

## Do not

- Do not `touch` a fake `.mkv`; a nonexistent path is parsed as a release name.
- Do not call `subliminal` directly with `-p provider` or several `-l` flags; narrowing providers or mixing languages in one query drops results. Use `fetch.sh`.
- Do not write to `data/subs/` by hand; the layout is `S01E01.<lang>.srt`, movies `movie.<lang>.srt`.
