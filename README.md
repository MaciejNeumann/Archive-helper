# Archive Helper

A tool for reviewing and scoring stale content in the Dynatrace Community. Upload a CSV export of community posts and Archive Helper scores each one from 1–5 stars based on age, interaction, and overlap with current Dynatrace Docs and Blog content — then lets you refine those scores with a dedicated LLM analysis skill.

**5 stars = strong archive candidate. 1 star = keep.**

## Getting started

**Requirements:** Node.js ≥ 18

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

1. Export community posts as a CSV from the Dynatrace Community portal.
2. Upload the CSV (UTF-16 LE, tab-separated, 3-line metadata preamble — the standard export format).
3. Click **Analyze**. Archive Helper crawls `docs.dynatrace.com` and the Dynatrace Blog on first run (cached for 7 days), extracts keywords from each post via TF-IDF, and scores every original thread.
4. Results appear in a sortable table, strongest archive candidates first.

By default only original thread posts are scored. Check **Also score reply messages** to include replies.

## Scoring signals

| Signal | Effect |
|---|---|
| Post older than 3 years | +2 (archive) |
| Post older than 1 year with zero replies | +1 (archive) |
| Post older than 1 year with zero kudos | +1 (archive) |
| Body mentions deprecated terms (AppMon, Ruxit, classic UI, …) | +2 (archive, capped) |
| Topic keyword overlap with Docs/Blog < 20% | +1 (archive) |
| Topic actively documented (≥ 60% overlap, pages updated < 12 months) and post < 1 year old | −1 (keep) |
| 5 or more replies | −1 (keep, active discussion) |
| At least 1 kudo | −1 (keep, community-endorsed) |

Star mapping: raw score 0–1 → 1★, 2 → 2★, 3 → 3★, 4 → 4★, ≥ 5 → 5★.

**Keyword vocabulary is gated by the docs/blog corpus** — a token only becomes a candidate keyword if it actually appears on `docs.dynatrace.com` or the Dynatrace Blog, which filters out typos, names, and conversational filler by construction.

**Release-notes pages are excluded from the freshness signal** — sprint changelogs touch every concept by design and are not evidence that a topic is "actively documented."

## Results table

| Column | Description |
|---|---|
| **✓ Checked** | Checkbox to mark posts you've reviewed; persists in saved sessions |
| **Archived** | Checkbox to record that a post has been archived in the community |
| **Score** | Stars + raw numeric score |
| **LLM review** | LLM verdict imported from the `analyze-post-context` skill (see below) |
| **Post** | Subject, body snippet, extracted keyword chips, link to the original post |
| **Docs & Blog overlap** | Verdict tag, ratio bar, matched keyword count, per-source page counts (📘 Docs / 📰 Blog), link to the most relevant matched page |
| **Why this score** | Plain-language list of every signal that contributed |
| **Author / Posted / Replies / Kudos** | Sortable; zero values in Replies and Kudos highlighted red |

The summary line at the top tracks: posts shown · total · checked · archived in community.

## Export & LLM review

The rule-based score is a fast first pass. To refine it with real content understanding:

1. Click **Export** and pick a scope — all analyzed posts, the current filtered view, or only unchecked posts. You get two files:
   - **CSV** — full data including post body, UTF-8 BOM for Excel
   - **JSON** — clean schema (`meta` + `posts[]`) consumed by the skill

2. Open the exported JSON in Claude Code and invoke the **`analyze-post-context`** skill (`.claude/skills/analyze-post-context/`). It reads each post's subject, body, and all replies, then produces an independent verdict with confidence and reasoning.

3. Click **Import LLM review** and select the emitted `*.llm-review.json`. Verdicts are matched by post index and shown in the **LLM review** column.

The filter bar includes an **LLM verdict** dropdown so you can isolate any verdict group, including where the LLM disagrees with the rule-based star score.

### LLM verdict types

| Verdict | Meaning |
|---|---|
| **Archive** | Content has clearly lost all value — deprecated product, EOL platform, no useful content |
| **Keep** | Still useful: working solution, recurring challenge, community-endorsed, actively discussed |
| **Stale answer** | Topic is valid and current, but the specific answer (old API endpoint, stale UI path, "coming soon" feature) may now be wrong or misleading — moderator can verify quickly |
| **Uncertain** | Genuinely unclear; human domain knowledge is needed to decide |

## The `analyze-post-context` skill

Lives in `.claude/skills/analyze-post-context/`. Run it inside Claude Code by passing an Archive Helper JSON export.

Key behaviors:
- **Reads replies** — the verdict accounts for what the thread resolved, not just the original question. A "me too" reply is ignored; a reply with concrete steps is a strong keep signal.
- **Parallel batch processing** — posts > 40 are split into batches of 30, up to 5 running concurrently. Each batch agent writes its results to a `*.results.json` file (crash-safe; restart skips completed batches).
- **Deduplication pass** — after all batches, a dedicated agent clusters posts on the same narrow topic and identifies which to keep vs. archive.
- **Adaptive report** — when all posts score identically (common with homogeneous exports), the report leads with archive candidates hidden in the mass rather than an empty disagreements section.
- **Conservative archive threshold** — requires ≥ 0.80 confidence to mark a post `archive`. Below that threshold on non-EOL content → `review:stale` for human review instead.
- Emits a `*.review-report.md` (prioritized for a moderator) and a `*.llm-review.json` (re-importable into the app).

## Sessions

Sessions auto-save after analysis. Name a session using the text field below the title, then restore it any time from the **Sessions** panel. Checkmark state, archived flags, LLM verdicts, and the full overlap breakdown are all preserved.

**Refresh docs cache** in the top nav forces a re-crawl of Docs and Blog ahead of the 7-day TTL.

## Architecture

```
archive-helper/
├── server.js                    # Express entry point, port 3000
├── routes/
│   ├── upload.js                # POST /api/upload
│   ├── analyze.js               # GET /api/analyze/:id  (Server-Sent Events)
│   └── sessions.js              # Session CRUD + /llm-import, /checked, /archived, /name
├── lib/
│   ├── csv-parser.js            # UTF-16 decode, skip preamble, TSV parse
│   ├── docs-crawler.js          # Sitemap + blog crawl, gzip cache, 8-worker concurrency
│   ├── keyword-extract.js       # TF-IDF top 25 keywords per post, corpus-gated vocabulary
│   ├── deprecated-terms.js      # Regex list of deprecated Dynatrace terminology
│   ├── scorer.js                # Combines all signals → score, stars, reasons, overlap data
│   └── session-store.js         # Read/write ./sessions/<id>.json, LLM result merging
├── .claude/skills/
│   └── analyze-post-context/    # Claude Code skill for LLM-assisted content review
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

Persistent state lives in two gitignored directories:

- `./cache/docs.json.gz` — crawl cache (7-day TTL)
- `./sessions/<uuid>.json` — one file per saved session

No LLM calls, no embeddings, no build step in the web app. Pure Node.js.

## Dependencies

`express` · `multer` · `iconv-lite` · `papaparse` · `cheerio` · `p-limit` · `uuid`
