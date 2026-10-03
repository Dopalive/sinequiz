---
name: fandom-fetch
description: Use when Fandom wiki text (episode summaries, character pages, "wiki kaynağı") for a TV series season or a movie must be collected into the SineQuiz pipeline's data/fandom/<slug>/ layout, or when an agent is hand-writing a MediaWiki scraper, fighting wikitext templates, SSL CERTIFICATE_VERIFY_FAILED from python, or inventing its own spoiler-trimming rules.
argument-hint: "<slug> <wiki-host> \"<Series Name>\" S01 1 7  |  <slug> <wiki-host> \"<Title>\" movie"
---

# fandom-fetch

Fetch what the pipeline's `FandomSource` reads (spec §4): the episode page plus the
character pages it links, spoiler-trimmed to that episode, into
`data/fandom/<slug>/S01E01.json` + `.txt` (movies: `movie.json`).

**Core principle:** the wiki's own structure (infobox `season`/`episode` fields,
`Characters` categories, `Season N` headings, `{{ep|1x4}}`-style labels) encodes
everything needed. Never write a show-specific collector or a spoiler word
blacklist; run `fetch.py` and judge its OK/WARN/MISS lines.

## Steps

1. Wiki host = the subdomain of `<x>.fandom.com`. Try the title without spaces
   (`breakingbad`, `theoffice`). On `MISS no wiki at …`, one web search for
   `<title> fandom wiki` gives the real one (`dark-netflix`). None: report MISS, stop.
2. From the repo root (`uv` installs the two python deps on first run):
   ```bash
   .claude/skills/fandom-fetch/fetch.py breaking-bad breakingbad "Breaking Bad" S01 1 7
   .claude/skills/fandom-fetch/fetch.py inception inception "Inception" movie
   ```
   The first run on a wiki resolves every season's episode pages (60–90 s for a
   long series, cached in `data/fandom/.cache/`), later runs take seconds. The
   first line is the `E01='Pilot', E02=…` map: every episode you asked for must be
   there with the right title.
3. `OK` shows page title, character count, total characters. 15k–40k characters
   and 8–20 characters per episode is a well-tended wiki; 2k and 1 character is a
   small one, not a bug. `WARN` names character pages that could not be dated to
   an episode (no `Season N` sections, or a season told without episode labels):
   only their opening paragraph was kept. Correct outcome, nothing to fix. Exit 1
   means a MISS.
4. Spot-check one `.txt`: the Summary/Plot text is this episode, a character's
   `## Season N` ends before an event you know comes later, and
   `grep -c '{{\|\[\[' file.txt` is 0.

## What the trimming does

| Page | Kept | Dropped |
|---|---|---|
| Episode | Lead, Summary/Plot/Acts, Trivia, Quotes, Production, Continuity | Gallery/Photos/Videos/References/Navigation |
| Character | `Background`/`Early life`/`History`; `Season N` < requested in full; the requested season up to the last paragraph run labelled with this or an earlier episode | Lead (whole-arc), Personality, Legacy, Deaths, Quotes, Trivia, `After …`, later seasons, unlabelled tail of the requested season |

Labels are wikilinks to the resolved episode pages, template parameters
(`{{ep|1x4}}`, `{{crossref|Pilot|Cancer Man}}`), quoted titles and `Season N`
mentions; wikis put them at the end of the paragraph run they cover.

Residual noise: a wiki shared by two shows (Breaking Bad + Better Call Saul)
leaves a bridge sentence naming the other show, and an opening backstory paragraph
can name a later character. Acceptable; facts carry `source_ref`. Do not hand-edit
the output files.

## When an episode is MISS

`MISS … no page with infobox season=S episode=E`: no candidate page carried those
fields (one-line infoboxes and `next`/`previous`-chained pages are handled). Re-run
after each step:

1. Pass the series name as the wiki writes it (`"The Office"`, not `"The Office (US)"`).
2. Open `https://<host>.fandom.com/wiki/Season_S`, find the page the wiki uses, add
   `"Page Title": [S, E]` to `data/fandom/.cache/<host>.<Series>.json`. The cache
   is resolver input, not output; editing it is the supported fix.
3. Episode pages with no infobox at all: report MISS with the page URL and stop.
4. Never scrape HTML, write a one-off collector, or add a word blacklist.

## Do not

- Do not use system `python3`/`urllib` against the API: the python.org build has no
  CA bundle (`SSL: CERTIFICATE_VERIFY_FAILED`). `fetch.py` runs under `uv` with
  `certifi`; keep the shebang.
- Do not strip tags from `action=parse&prop=text`; Fandom injects navigation
  widgets into section HTML. Wikitext + `mwparserfromhell` is what works.
- Do not guess page titles (`...And the Bag's in the River` is `missingtitle`, the
  real title is lowercase). Resolution goes through infobox fields.
- Do not write `data/fandom/` by hand. Layout mirrors `data/subs/`:
  `S01E01.json|txt`, movies `movie.json|txt`.
