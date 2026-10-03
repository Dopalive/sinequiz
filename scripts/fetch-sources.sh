#!/usr/bin/env bash
# Collect sources (subtitles EN+TR + Fandom text) for every title in titles.json.
#
#   scripts/fetch-sources.sh                 # fetch whatever is missing, for every title
#   scripts/fetch-sources.sh fleabag         # one or more slugs only
#   scripts/fetch-sources.sh --status        # table of done/missing, fetch nothing
#   FORCE=1 scripts/fetch-sources.sh ...     # re-fetch even files that already exist
#
# Needs: jq, subliminal (uv tool install subliminal), uv. Run from the repo root.
# Per unit (one season or one movie) it runs the two skills' helpers:
#   .claude/skills/stl-download/fetch.sh  <slug> <subs.release> S0N 1 <episodes> | movie
#   .claude/skills/fandom-fetch/fetch.py  <slug> <fandom.host> "<fandom.series>" S0N 1 <episodes> | movie
# A unit is skipped when every expected file already exists (data/subs/<slug>/S0NE0M.{en,tr}.srt,
# data/fandom/<slug>/S0NE0M.json; movies: movie.*). fandom.host = null means the title has no wiki
# and fandom is reported SKIP. Exit code 1 when anything is still MISS afterwards.
set -o pipefail
cd "$(dirname "$0")/.."
status_only=0; slugs=()
for a in "$@"; do case $a in --status) status_only=1;; -h|--help) sed -n 2,17p "$0"; exit 0;; *) slugs+=("$a");; esac; done

want() { # slug -> list of "unit|subs_release|fandom_host|fandom_series|mode|episodes"
  jq -r --arg s "$1" '.titles[] | select(.slug==$s) |
    if .kind=="movie" then "movie|\(.subs.release)|\(.fandom.host // "")|\(.fandom.series)|movie|0"
    else .seasons[] as $se | "S\($se.season|tostring|if length<2 then "0"+. else . end)|\(.subs.release)|\(.fandom.host // "")|\(.fandom.series)|season|\($se.episodes)" end' titles.json
}
expected() { # kind unit episodes -> expected base names (S01E01 ... or movie)
  if [[ $1 == movie ]]; then echo movie; else for ((e=1; e<=$3; e++)); do printf '%sE%02d\n' "$2" "$e"; done; fi
}
count_missing() { # slug kind unit episodes -> "subs_missing fandom_missing"
  local sm=0 fm=0 k
  for k in $(expected "$2" "$3" "$4"); do
    [[ -s data/subs/$1/$k.en.srt && -s data/subs/$1/$k.tr.srt ]] || sm=$((sm+1))
    [[ -s data/fandom/$1/$k.json ]] || fm=$((fm+1))
  done; echo "$sm $fm"
}

[[ ${#slugs[@]} -eq 0 ]] && slugs=($(jq -r '.titles[].slug' titles.json))   # bash 3.2 (macOS): no mapfile
total_missing=0
printf '%-14s %-6s %-5s %-14s %-14s\n' TITLE UNIT EPS SUBS FANDOM
for slug in "${slugs[@]}"; do
  while IFS='|' read -r unit release host series mode eps; do
    [[ $mode == movie ]] && n=1 || n=$eps
    read -r sm fm <<<"$(count_missing "$slug" "$mode" "$unit" "$eps")"
    if [[ $status_only -eq 0 ]] && [[ ${FORCE:-} == 1 || $sm -gt 0 ]]; then
      echo "--- $slug $unit: subtitles ($release)"
      if [[ $mode == movie ]]; then .claude/skills/stl-download/fetch.sh "$slug" "$release" movie
      else .claude/skills/stl-download/fetch.sh "$slug" "$release" "$unit" 1 "$eps"; fi
    fi
    if [[ -n $host ]] && [[ $status_only -eq 0 ]] && [[ ${FORCE:-} == 1 || $fm -gt 0 ]]; then
      echo "--- $slug $unit: fandom ($host.fandom.com, \"$series\")"
      if [[ $mode == movie ]]; then .claude/skills/fandom-fetch/fetch.py "$slug" "$host" "$series" movie
      else .claude/skills/fandom-fetch/fetch.py "$slug" "$host" "$series" "$unit" 1 "$eps"; fi
    fi
    read -r sm fm <<<"$(count_missing "$slug" "$mode" "$unit" "$eps")"
    subs_s="OK $((n-sm))/$n"; [[ $sm -gt 0 ]] && subs_s="MISS $((n-sm))/$n"
    if [[ -z $host ]]; then fan_s="SKIP (no wiki)"; fm=0
    else fan_s="OK $((n-fm))/$n"; [[ $fm -gt 0 ]] && fan_s="MISS $((n-fm))/$n"; fi
    total_missing=$((total_missing+sm+fm))
    printf '%-14s %-6s %-5s %-14s %-14s\n' "$slug" "$unit" "$n" "$subs_s" "$fan_s"
  done < <(want "$slug")
done
[[ $total_missing -eq 0 ]] && echo "all sources present" || { echo "$total_missing unit-file(s) missing - see the skills' 'When ... is MISS' sections"; exit 1; }
