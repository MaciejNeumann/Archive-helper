# Archive Helper

A tool for reviewing and scoring stale content in the Dynatrace Community. Upload a CSV export of community posts, and Archive Helper scores each one from 1–5 stars based on age, interaction, and overlap with current Dynatrace Docs and Blog content.

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
2. Upload the CSV in the UI (UTF-16 LE, tab-separated, 3-line metadata preamble — the standard export format).
3. Click **Analyze**. Archive Helper crawls `docs.dynatrace.com` and the Dynatrace Blog on first run (cached for 7 days), extracts keywords from each post, and scores every original thread.
4. Results appear in a sortable table, strongest archive candidates first.

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

## Results table columns

- **Checked** — checkbox to mark posts you've reviewed; persists in saved sessions
- **Score** — stars + raw numeric score
- **Post** — subject, body snippet, extracted keyword chips, link to original post
- **Author / Posted / Replies / Kudos** — sortable; zero values in Replies and Kudos highlighted red
- **Docs & Blog overlap** — verdict tag, ratio bar, matched keyword count, per-source page counts (📘 Docs / 📰 Blog), and a link to the most relevant matched page
- **Why this score** — plain-language list of every signal that contributed

## Sessions

Sessions auto-save after analysis. Use the session panel to restore a previous run — checkmark state and the full overlap breakdown are preserved.

The **Refresh docs cache** button in the UI forces a re-crawl of Docs and Blog ahead of the 7-day TTL.

## Architecture

```
archive-helper/
├── server.js               # Express entry point
├── routes/
│   ├── upload.js           # POST /api/upload
│   ├── analyze.js          # GET /api/analyze/:id  (Server-Sent Events)
│   ├── sessions.js         # GET/POST/DELETE /api/sessions
│   └── checked.js          # PATCH /api/sessions/:id/checked
├── lib/
│   ├── csv-parser.js       # UTF-16 decode, skip preamble, TSV parse
│   ├── docs-crawler.js     # Sitemap + blog crawl, gzip cache
│   ├── keyword-extract.js  # TF-IDF top 25 keywords per post
│   ├── deprecated-terms.js # Regex list of deprecated Dynatrace terminology
│   ├── scorer.js           # Combines signals → score, stars, reasons
│   └── session-store.js    # Read/write ./sessions/<id>.json
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

Persistent state lives in two gitignored directories:

- `./cache/docs.json.gz` — crawl cache (7-day TTL)
- `./sessions/<uuid>.json` — one file per saved session

No LLM, no embeddings, no build step. Pure Node.js.

## Dependencies

`express` · `multer` · `iconv-lite` · `papaparse` · `cheerio` · `uuid`
