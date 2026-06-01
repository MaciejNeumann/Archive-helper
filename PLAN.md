# Archive Helper — Implementation Plan

## Context
The Dynatrace Community accumulates thousands of forum posts; many become stale and should be archived. This tool ingests a CSV export of community posts, scores each post for archive-worthiness (1–5 stars), and presents the results in a reviewable, dynatrace.com-styled UI with per-row checkmarks and session save/restore.

CSV format verified against the real sample (`csv_search-6-1780304887600.csv`, ~2,800 rows):
- **UTF-16 LE** encoded, **tab-separated** despite `.csv` extension.
- First 3 lines are export metadata (title, timestamp, search query); line 4 is the column header, 30 columns total.
- Relevant columns: `Message Subject`, `Message Body No HTML`, `Message URL`, `Author`, `Time of Post`, `Replies/Comments`, `Kudos`, `Parent Message URL`, `Root Message URL`, `Node Type`.
- Time format: `26 Feb 2026 06:05 PM`.
- Mixed originals and replies (replies have subjects prefixed with `Re:`).

Locked-in decisions:
- **Web app** (Express + vanilla browser frontend), no build step.
- **No Claude API available** → outdatedness check is keyword + freshness + curated deprecated-terms list. No LLM, no embeddings.
- **Single CSV upload** (community posts only). The user-data CSV and the "author logged in 12 months" rule have been dropped from scope.
- **Sessions stored as JSON files** on disk under `./sessions/`.
- **Volume: 500–5,000 posts** → worker pool for the docs crawl + persistent on-disk cache.

## Architecture
Single Node.js process serving an Express API and static assets. No frontend framework — vanilla HTML/CSS/JS. All persistent state on disk in two folders (gitignored): `./cache/` (Docs/Blog crawl) and `./sessions/` (saved analyses).

```
archive-helper/
├── server.js               # Express entry; route mounting; static /public
├── package.json
├── .gitignore              # node_modules/, cache/, sessions/, uploads/
├── routes/
│   ├── upload.js           # POST /api/upload         → parse CSV, return session id
│   ├── analyze.js          # POST /api/analyze/:id    → run scoring, stream SSE progress
│   ├── sessions.js         # GET / POST / DELETE      → list / save / remove sessions
│   └── checked.js          # PATCH /api/sessions/:id/checked  → toggle per-post checkmark
├── lib/
│   ├── csv-parser.js       # UTF-16 → UTF-8 decode, skip 3 preamble lines, TSV parse
│   ├── docs-crawler.js     # Crawl docs.dynatrace.com sitemap + blog index, cache to disk
│   ├── keyword-extract.js  # Strip HTML, tokenize, stop-word + TF-IDF → top 15 keywords/post
│   ├── deprecated-terms.js # Curated regex list (AppMon, Ruxit, classic UI, dynaTrace 6/7…)
│   ├── scorer.js           # Combine signals → score + human-readable reasons + 1–5 stars
│   └── session-store.js    # Read/write JSON under ./sessions/<id>.json
└── public/
    ├── index.html          # Upload card → progress → results table; single page
    ├── style.css           # Dynatrace-inspired: blues/purples, clean cards, subtle motion
    └── app.js              # Fetch APIs, render table, sort, checkbox handler, session UI
```

## Scoring model (1–5 stars; 5 = strongest archive candidate)

| Signal | Points | Reason text |
|---|---:|---|
| Post age > 3 years | +2 | "Posted N years ago (>3y threshold)" |
| Post age > 1 year **and** zero replies | +1 | "No comments in over a year" |
| Post age > 1 year **and** zero kudos | +1 | "No kudos in over a year" |
| Body mentions deprecated terms (capped) | +2 (capped) | "Mentions deprecated: AppMon, classic UI" |
| Keyword overlap with current Docs/Blog < 20% | +1 | "Topic not found in current Docs/Blog" |
| Keyword overlap ≥ 60% **and** matched pages updated within 12 months | −1 | "Topic actively documented" |

Star mapping (after clamping to ≥0): 0–1 → 1★, 2 → 2★, 3 → 3★, 4 → 4★, ≥5 → 5★.

## Outdatedness pipeline (no LLM)
1. **One-time docs crawl** — `docs.dynatrace.com/sitemap.xml` + blog index, cached to `./cache/docs.json`, 8-worker concurrency, 7-day TTL.
2. **Keyword extraction** — TF-IDF top 15 per post, stop-words + ~50 Dynatrace-generic terms removed.
3. **Overlap & freshness** — count matching keywords in cached corpus, take most-recent last-modified date of matching pages.
4. **Deprecated-terms scan** — regex against subject + body.

## Other decisions
- **Originals only**: only rows where `Parent Message URL === Root Message URL`.
- **SSE progress** from `/api/analyze/:id`.
- **Session JSON**: `{ id, createdAt, sourceFile, docsCacheVersion, posts: [...] }`.

## Style
Dynatrace blue `#1496FF` + accent purple `#7F60D4` + soft white background. Cards, subtle shadows, rounded corners. Gold SVG stars. Progress shimmer, row hover, checkbox bounce. No chat-like LLM chrome.

## Dependencies
`express`, `multer`, `iconv-lite`, `papaparse`, `cheerio`, `p-limit`, `uuid`.

## Verification
1. `npm install && npm start` → `http://localhost:3000`.
2. Upload the sample CSV; expect ~2,821 parsed rows, originals-only filter applied.
3. First analyze run triggers docs crawl; second uses cache.
4. Table sorts 5★ → 1★, "Why" column populated, links work.
5. Save session, restart, restore — checkmarks survive.
