#!/usr/bin/env bash
# Download SRT subtitles for a series season (or a movie) into data/subs/<slug>/.
# Needs: subliminal on PATH (uv tool install subliminal).
#
#   fetch.sh <slug> "<Release Title>" S<season> <from-ep> <to-ep> [langs]
#   fetch.sh <slug> "<Release Title>" movie [langs]
#
#   <Release Title> is release-style: dots for spaces, year for ambiguous titles.
#   e.g. "Breaking.Bad"  "Dark.2017"  "The.Office.US"  "Inception.2010"
#   langs default: en,tr   (IETF codes, comma separated)
#   PROVIDERS=ALL fetch.sh ...   widens the provider list on a stubborn MISS.
#   MIN_SCORE=60 (default)       subliminal match score; below it the series/title
#                                did not match and the file is another show.
#
# Each missing file is retried with the next source tag (WEB, BluRay, HDTV, DVDRip)
# because providers index release names and a title may only exist under one tag.
# Output: data/subs/<slug>/S01E01.en.srt  (movie: data/subs/<slug>/movie.en.srt)
set -euo pipefail

slug=${1:?slug}; title=${2:?release title}; mode=${3:?S01 | movie}
out="data/subs/$slug"; mkdir -p "$out"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

if [[ $mode == movie ]]; then
  langs=${4:-en,tr}; keys=(movie); tags=(BluRay WEB HDTV DVDRip)
else
  from=${4:?from-ep}; to=${5:?to-ep}; langs=${6:-en,tr}; tags=(WEB BluRay HDTV DVDRip)
  keys=(); for ((e=from; e<=to; e++)); do keys+=("$(printf '%sE%02d' "$mode" "$e")"); done
fi
IFS=, read -ra L <<<"$langs"
pargs=(-m "${MIN_SCORE:-60}"); [[ -n ${PROVIDERS:-} ]] && pargs+=(-p "$PROVIDERS")

name_for() { # key tag -> release name (nonexistent path; subliminal parses it as a release)
  [[ $1 == movie ]] && echo "$title.1080p.$2.x264.mkv" || echo "$title.$1.1080p.$2.x264.mkv"
}
done_file() { [[ -s $1 ]] && grep -q -- '-->' "$1" && ! grep -qi '<html' "$1"; }

# One language per query: with several -l flags opensubtitles returns a capped,
# English-heavy result set and the other language silently goes missing.
for tag in "${tags[@]}"; do
  for l in "${L[@]}"; do
    pending=(); for k in "${keys[@]}"; do [[ -e $tmp/$k.$l ]] || pending+=("$k"); done
    [[ ${#pending[@]} -eq 0 ]] && continue
    names=(); for k in "${pending[@]}"; do names+=("$(name_for "$k" "$tag")"); done
    echo "== $l / source tag $tag: ${pending[*]}"
    mkdir -p "$tmp/$tag.$l"
    subliminal download -l "$l" "${pargs[@]}" -d "$tmp/$tag.$l" -vv "${names[@]}" 2>&1 \
      | grep -vE "opensubtitlescom|^Collecting|^Downloading|collected|subtitle(s)? downloaded" || true
    for k in "${pending[@]}"; do
      base=$(name_for "$k" "$tag"); base=${base%.mkv}
      done_file "$tmp/$tag.$l/$base.$l.srt" && cp "$tmp/$tag.$l/$base.$l.srt" "$tmp/$k.$l"
    done
  done
done

missing=0
for k in "${keys[@]}"; do for l in "${L[@]}"; do
  dst="$out/$k.$l.srt"
  if [[ -e $tmp/$k.$l ]]; then
    sed $'1s/^\xEF\xBB\xBF//; s/\r$//' "$tmp/$k.$l" > "$dst"   # strip UTF-8 BOM + CRLF
    echo "OK   $dst ($(grep -c -- '-->' "$dst") cues)"
  else
    rm -f "$dst"; echo "MISS $dst"; missing=$((missing+1))   # never keep a stale earlier attempt
  fi
done; done
[[ $missing -eq 0 ]] || { echo "$missing file(s) missing — see SKILL.md 'When a file is MISS'"; exit 1; }
