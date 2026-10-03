#!/usr/bin/env -S uv run --quiet --with certifi,mwparserfromhell python
# Fetch Fandom wiki source text for a series season (or a movie) into data/fandom/<slug>/.
#
#   fetch.py <slug> <wiki-host> "<Series Name>" S<season> <from-ep> <to-ep>
#   fetch.py <slug> <wiki-host> "<Title>" movie
#
#   <wiki-host> is the subdomain: breakingbad (-> breakingbad.fandom.com), theoffice, dark-netflix
#   <Series Name> is the display name used to score pages when a wiki hosts several shows.
#
# Output: data/fandom/<slug>/S01E01.json + S01E01.txt   (movie: movie.json / movie.txt)
#         data/fandom/.cache/<host>.<series>.json  episode-page map for every season (delete to re-resolve)
#   json: {slug, season, episode, page, url, revid, sections:{heading:text}, characters:[{page,url,sections}]}
#   txt : same text with markdown headings, for eyeballing.
# Spoiler trimming is structural: from character pages only backstory sections (Background, Early life,
# History) and "Season N" sections with N <= season survive, cut at the first paragraph that links to
# a later episode of the requested season. Lead, Personality, Legacy, Deaths, Quotes, Trivia are dropped. Episode pages lose gallery/photo/video sections.
# Needs only `uv` on PATH (it fetches certifi + mwparserfromhell). Use this instead of system python:
# the python.org build has no CA bundle and fails with SSL CERTIFICATE_VERIFY_FAILED.
import json, re, ssl, sys, time, urllib.parse, urllib.request
from pathlib import Path
import certifi, mwparserfromhell as mw

UA = "SineQuizPipeline/0.1 (dev; github.com/hakandopa/sinequiz)"
CTX = ssl.create_default_context(cafile=certifi.where())
SEASON_KEYS = {"season", "partofseason", "series", "season_no", "seasonnumber"}
EPISODE_KEYS = {"episode", "episodenumber", "number", "episode_no", "ep", "episodenum"}
NEXT_KEYS = {"next", "nextepisode", "next_episode", "nextep"}
PREV_KEYS = {"previous", "prev", "previousepisode", "previous_episode", "prevep"}
HEADING_SEASON = re.compile(r"\b(?:Seasons?|Series)\s+(\d+)(?:\s*[–\-]\s*(\d+))?", re.I)   # "Season 2", "Seasons 1–3"
DROP_EPISODE = re.compile(r"gallery|photos?|videos?|images?|references|navigation|external links|see also", re.I)
KEEP_CHARACTER = re.compile(r"background|early life|before|biography|history|origin|childhood", re.I)
DROP_CHARACTER = re.compile(r"legacy|after |later life|post-|epilogue|deaths?|fate|future|flash-?forward|aftermath", re.I)
EP_TEMPLATE = re.compile(r"^\s*(\d+)\s*[xX]\s*(\d+)\s*$")


def api(host, **params):
    params.update(format="json")
    url = f"https://{host}.fandom.com/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30, context=CTX) as r:
                data = json.load(r)
            if "error" in data:
                raise RuntimeError(f"{host}: {data['error'].get('code')}: {data['error'].get('info')}")
            return data
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def search_titles(host, query, pages=3):
    titles = []
    for off in range(0, 50 * pages, 50):
        hits = api(host, action="query", list="search", srsearch=query, srlimit=50, sroffset=off, srnamespace=0)["query"]["search"]
        titles += [h["title"] for h in hits]
        if len(hits) < 50:
            break
    return titles


def wikitext_batch(host, titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 50):
        r = api(host, action="query", prop="revisions|info", rvprop="content|ids", rvslots="main", inprop="url", redirects=1, titles="|".join(titles[i:i + 50]))
        for p in r["query"]["pages"].values():
            if "revisions" in p:
                out[p["title"]] = {"text": p["revisions"][0]["slots"]["main"]["*"], "revid": p["revisions"][0]["revid"], "url": p["fullurl"]}
    return out


def infobox(wikitext):
    """season / episode / next / previous from the first template that carries a season field.
    Parsed with mwparserfromhell, so one-line infoboxes (|season = 1|episode = 5) work too."""
    for tpl in mw.parse(wikitext[:4000]).ifilter_templates():
        params = {str(p.name).strip().lower().replace(" ", ""): str(p.value) for p in tpl.params}
        if not (params.keys() & SEASON_KEYS):
            continue
        def num(keys):
            for k in keys:
                m = k in params and re.search(r"\d+", params[k])
                if m:
                    return int(m.group())
        def link(keys):
            for k in keys:
                if k in params:
                    links = mw.parse(params[k]).filter_wikilinks()
                    if links:
                        return str(links[0].title).split("#")[0].strip().replace("_", " ")
                    v = mw.parse(params[k]).strip_code().strip()
                    if v:
                        return v
        return {"season": num(SEASON_KEYS), "episode": num(EPISODE_KEYS), "next": link(NEXT_KEYS), "previous": link(PREV_KEYS)}
    return None


def resolve_episodes(host, series, season):
    """One season: {episode number: page title}. Infobox season/episode first; pages whose infobox has no
    episode number are numbered through their next/previous chain, then by order on the Season page."""
    cands = set()
    for q in (f'"season {season}" episode', f'"series {season}" episode', f'"{series}" "season {season}"'):
        cands |= set(search_titles(host, q))
    season_pages, season_text = [t for t in cands if re.fullmatch(rf"(Season|Series) {season}( \(.*\))?", t)], ""
    for t in season_pages:
        r = api(host, action="query", prop="links", titles=t, plnamespace=0, pllimit="max")
        for p in r["query"]["pages"].values():
            cands |= {l["title"] for l in p.get("links", [])}
    pages = wikitext_batch(host, sorted(cands))
    info = {}
    for title, page in pages.items():
        ib = infobox(page["text"])
        if ib and ib["season"] == season:
            ib["score"] = len(re.findall(re.escape(series), page["text"][:3000], re.I))
            info[title] = ib
    for _ in range(len(info)):                       # number unnumbered pages from their neighbours
        changed = False
        for t, ib in info.items():
            if ib["episode"] is None:
                nxt, prv = info.get(ib["next"] or ""), info.get(ib["previous"] or "")
                if nxt and nxt["episode"]:
                    ib["episode"], changed = nxt["episode"] - 1, True
                elif prv and prv["episode"]:
                    ib["episode"], changed = prv["episode"] + 1, True
        if not changed:
            break
    unnumbered = [t for t, ib in info.items() if ib["episode"] is None]
    if unnumbered and season_pages:
        season_text = pages.get(season_pages[0], {}).get("text") or wikitext_batch(host, season_pages[:1]).get(season_pages[0], {}).get("text", "")
        order = sorted(info, key=lambda t: (season_text.find(f"[[{t}") if f"[[{t}" in season_text else 10**9, t))
        if all(f"[[{t}" in season_text for t in info):
            for n, t in enumerate(order, 1):
                info[t]["episode"] = n
    best = {}
    for t, ib in info.items():
        ep = ib["episode"]
        if ep is not None and (ep not in best or ib["score"] > best[ep][0]):
            best[ep] = (ib["score"], t)
    return {ep: t for ep, (_, t) in best.items()}


def resolve_all(host, series):
    """Every season's episode pages, {title: (season, episode)}, cached per host under data/fandom/.cache/.
    All seasons are needed so that a character page's reference to a later-season episode is recognized."""
    cache = Path("data/fandom/.cache") / f"{host}.{re.sub(r'[^A-Za-z0-9]+', '-', series)}.json"
    if cache.exists():
        return {t: tuple(v) for t, v in json.loads(cache.read_text()).items()}
    titles, empty = {}, 0
    for season in range(1, 40):
        eps = resolve_episodes(host, series, season)
        empty = 0 if eps else empty + 1
        if empty >= 2:
            break
        titles.update({t: (season, e) for e, t in eps.items()})
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(titles, ensure_ascii=False, indent=0))
    return titles


def character_pages(host, page_title):
    """Pages linked from the episode page that sit in a *Characters category (follows API continuation:
    categories are capped per request, so one call silently drops the categories of later pages)."""
    cats, cont = {}, {}
    while True:
        r = api(host, action="query", generator="links", titles=page_title, gplnamespace=0, gpllimit=500, prop="categories", cllimit="max", redirects=1, **cont)
        for p in r.get("query", {}).get("pages", {}).values():
            cats.setdefault(p["title"], []).extend(c["title"] for c in p.get("categories", []))
        cont = r.get("continue")
        if not cont:
            break
    real_person = re.compile(r"^Category:(actors|actresses|cast|crew|writers|directors|producers|real people)$", re.I)
    return [t for t, c in cats.items() if any(re.search(r"character", x, re.I) for x in c) and not any(real_person.match(x) for x in c)]


def clean(wikitext):
    code = mw.parse(wikitext)
    for node in list(code.ifilter_wikilinks()):
        if re.match(r"\s*(File|Image|Category):", str(node.title), re.I):
            try:
                code.remove(node)
            except ValueError:
                pass
    for tag in list(code.ifilter_tags()):
        if tag.tag.lower() in ("gallery", "ref", "tabber", "div", "table"):
            try:
                code.remove(tag)
            except ValueError:
                pass
    text = code.strip_code(normalize=True, collapse=True)
    text = re.sub(r"^[\s|!{}\-]+$", "", text, flags=re.M)      # leftover table/template rows
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_sections(wikitext):
    """-> list of (level, heading, body_wikitext); level 0 = lead."""
    parts = re.split(r"^(={2,6})\s*(.+?)\s*\1\s*$", wikitext, flags=re.M)
    sections = [(0, "", parts[0])]
    for i in range(1, len(parts), 3):
        sections.append((len(parts[i]), mw.parse(parts[i + 1]).strip_code().strip(), parts[i + 2]))
    return sections


def episode_refs(para, season, titles):
    """Every (season, episode) a paragraph refers to: wikilinks to episode pages, template params that
    are an episode title or a 1x4-style code ({{ep|1x4}}, {{crossref|Pilot|Cancer Man}}), quoted titles,
    and bare 'season N' / 'seasons 1-3' mentions (as (N, 0))."""
    code, refs = mw.parse(para), set()
    for l in code.ifilter_wikilinks():
        t = str(l.title).split("#")[0].strip().replace("_", " ")
        if t in titles:
            refs.add(titles[t])
    for tpl in code.ifilter_templates():
        for prm in tpl.params:
            v = str(prm.value).strip()
            m = EP_TEMPLATE.match(v)
            if m:
                refs.add((int(m.group(1)), int(m.group(2))))
            elif v in titles:
                refs.add(titles[v])
    for t, se in titles.items():
        if re.search(rf"(?:\"|'')\s*{re.escape(t)}\s*(?:\"|'')", para):
            refs.add(se)
    for m in re.finditer(r"\b(?:seasons?|series)\s+(\d+)(?:\s*[–\-]\s*(\d+))?\b", para, re.I):
        refs.add((int(m.group(2) or m.group(1)), 0))
    return refs


def trim_character(wikitext, season, episode, titles):
    """Keep only the backstory and the 'Season N' (N <= season) parts of a character page.
    Everything else (lead, personality, legacy, deaths, quotes, trivia) summarizes the whole arc."""
    out, chain, season_ctx, unlabelled = {}, [], None, False   # chain: [(level, heading)] of enclosing sections
    sections = split_sections(wikitext)
    for level, heading, body in sections:
        if level == 0:
            continue
        while chain and chain[-1][0] >= level:
            chain.pop()
        chain.append((level, heading))
        if season_ctx and level <= season_ctx[0]:
            season_ctx = None
        m = HEADING_SEASON.search(heading)
        if m and not season_ctx:
            season_ctx = (level, int(m.group(2) or m.group(1)))   # a range heading counts as its last season
        if season_ctx and season_ctx[1] > season:
            continue
        if any(DROP_CHARACTER.search(h) for _, h in chain):
            continue
        if not season_ctx and not any(KEEP_CHARACTER.search(h) for _, h in chain):
            continue
        paras = re.split(r"\n\s*\n", body)
        all_refs = [episode_refs(para, season, titles) for para in paras]
        if season_ctx and season_ctx[1] == season:
            # The requested season. Wikis label a run of paragraphs with the episode they come from at the
            # END of the run ({{crossref|Pilot}}, <ref>[[Celebration]]</ref>), so a run is kept only once a
            # label <= this episode closes it; an unlabelled tail belongs to an unknown later episode.
            kept, run = [], []
            for para, refs in zip(paras, all_refs):
                run.append(para)
                if refs:
                    if max(refs) <= (season, episode):
                        kept += run
                    elif any(r <= (season, episode) for r in refs):
                        kept += run[:-1]                # labelled with this and later episodes: keep the run, drop the mixed paragraph
                    else:
                        break                           # a later episode starts here
                    run = []
            if not kept and not any(all_refs):
                kept, unlabelled = paras[:1], True      # no episode labels at all: only the opening paragraph is safe
        else:
            kept = []
            for para, refs in zip(paras, all_refs):
                if any(r > (season, episode) for r in refs):
                    if any(r <= (season, episode) for r in refs):
                        continue
                    break
                kept.append(para)
        text = clean("\n\n".join(kept))
        if text:
            out[heading] = text
    if unlabelled and any(HEADING_SEASON.search(h) for h in out):
        return out, "unlabelled"
    if not any(HEADING_SEASON.search(h) for h in out):
        # The biography has no "Season N" structure (in-universe years, one running narrative): nothing
        # in it can be dated to an episode, so only the opening paragraph of the first backstory section is safe.
        for level, heading, body in sections:
            if level and KEEP_CHARACTER.search(heading) and not DROP_CHARACTER.search(heading):
                first = clean(re.split(r"\n\s*\n", body.strip())[0])
                return ({heading: first} if first else {}), "untrimmable"
        return {}, "untrimmable"
    return out, None


def trim_episode(wikitext):
    out, skip_level = {}, None
    for level, heading, body in split_sections(wikitext):
        if skip_level and level > skip_level:
            continue
        skip_level = None
        if level and DROP_EPISODE.search(heading):
            skip_level = level
            continue
        text = clean(body)
        if text:
            out[heading or "Lead"] = text
    return out


def to_txt(doc):
    lines = [f"# {doc['page']}"]
    for h, t in doc["sections"].items():
        lines += [f"\n## {h}", t]
    for c in doc["characters"]:
        lines.append(f"\n# Character: {c['page']}")
        for h, t in c["sections"].items():
            lines += [f"\n## {h}", t]
    return "\n".join(lines) + "\n"


def write(out_dir, key, doc):
    chars = sum(len(t) for t in doc["sections"].values()) + sum(len(t) for c in doc["characters"] for t in c["sections"].values())
    (out_dir / f"{key}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    (out_dir / f"{key}.txt").write_text(to_txt(doc))
    print(f"OK   {out_dir}/{key}.json  page={doc['page']!r}  {len(doc['characters'])} characters  {chars} chars")
    for w in doc["warnings"]:
        print(f"WARN {key}: {w}")


def fetch_doc(host, slug, page_title, season, episode, titles):
    page = wikitext_batch(host, [page_title])
    title = next(iter(page))
    chars, untrimmable, unlabelled = [], [], []
    for ct, cp in wikitext_batch(host, character_pages(host, title)).items():
        if season:
            sections, warn = trim_character(cp["text"], season, episode, titles)
            if warn == "untrimmable":
                untrimmable.append(ct)
            elif warn == "unlabelled":
                unlabelled.append(ct)
        else:
            sections = trim_episode(cp["text"])
        if sections:
            chars.append({"page": ct, "url": cp["url"], "revid": cp["revid"], "sections": sections})
    doc = {"slug": slug, "season": season, "episode": episode, "page": title, "url": page[title]["url"], "revid": page[title]["revid"],
           "sections": trim_episode(page[title]["text"]), "characters": chars}
    doc["warnings"] = []
    if untrimmable:
        doc["warnings"].append(f"{len(untrimmable)} character page(s) have no 'Season N' sections, so nothing in them can be dated to an episode; "
                               f"at most their opening backstory paragraph was kept: {', '.join(untrimmable)}")
    if unlabelled:
        doc["warnings"].append(f"{len(unlabelled)} character page(s) tell season {season} without episode references; "
                               f"only the opening paragraph of that season was kept: {', '.join(unlabelled)}")
    return doc


def main(argv):
    if len(argv) < 5:
        sys.exit(__doc__ or "usage: fetch.py <slug> <host> \"<Series>\" S01 <from> <to> | fetch.py <slug> <host> \"<Title>\" movie")
    slug, host, series, mode = argv[1:5]
    try:
        api(host, action="query", meta="siteinfo")
    except urllib.error.HTTPError as e:
        sys.exit(f"MISS no wiki at {host}.fandom.com (HTTP {e.code}). Find the subdomain with one web search "
                 f"'{series} fandom wiki' and pass it as <wiki-host>; if there is none, report MISS and stop.")
    out_dir = Path("data/fandom") / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    missing = 0
    if mode == "movie":
        hits = search_titles(host, series, pages=1)
        if not hits:
            print(f"MISS {out_dir}/movie.json  no page found for {series!r} on {host}.fandom.com"); sys.exit(1)
        write(out_dir, "movie", fetch_doc(host, slug, hits[0], 0, 0, {}))
        return
    season, first, last = int(mode.lstrip("Ss")), int(argv[5]), int(argv[6])
    titles = resolve_all(host, series)
    episodes = {e: t for t, (s_, e) in titles.items() if s_ == season}
    print(f"== {host}.fandom.com: {len(titles)} episode pages over {max((s_ for s_, _ in titles.values()), default=0)} seasons; "
          f"season {season}: " + ", ".join(f"E{e:02d}={t!r}" for e, t in sorted(episodes.items())))
    for ep in range(first, last + 1):
        key = f"S{season:02d}E{ep:02d}"
        if ep not in episodes:
            for f in (out_dir / f"{key}.json", out_dir / f"{key}.txt"):
                f.unlink(missing_ok=True)
            print(f"MISS {out_dir}/{key}.json  no page with infobox season={season} episode={ep}"); missing += 1
            continue
        write(out_dir, key, fetch_doc(host, slug, episodes[ep], season, ep, titles))
    if missing:
        print(f"{missing} episode(s) missing — see SKILL.md 'When an episode is MISS'"); sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
