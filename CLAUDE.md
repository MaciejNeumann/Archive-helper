## Project purpose
A tool that helps archive stale content in the Dynatrace Community. The user uploads a CSV export of community posts; the Archive helper checks each post against the Dynatrace Documentation and Dynatrace Blog and against age/interaction rules, then scores each from 1 to 5 stars — 5 = strong candidate for archiving, 1 = keep.

## Product features
1. Upload a **single CSV file** with Dynatrace Community posts (UTF-16 LE, tab-separated, with a 3-line metadata preamble before the header).
2. On "Analyze", the Archive helper checks each post against Dynatrace Documentation (https://docs.dynatrace.com/docs) and Dynatrace Blog (https://www.dynatrace.com/news/blog/). If a post's topic is missing from current docs/blog or only matches stale pages, its archive score increases.
3. Rule-based signals on top of the doc check:
    a. Post older than 3 years → increases archive score.
    b. Post older than 1 year **and** no comments → increases archive score.
    c. Post older than 1 year **and** no kudos → increases archive score.
    d. Body mentions deprecated Dynatrace terms (AppMon, Ruxit, dynaTrace 6/7, classic UI, …) → increases archive score.
4. Results render in a sortable, fixed-layout table sized to fit the viewport without sideways scrolling. The strongest archive candidates (5★) sit at the top, weakest (1★) at the bottom. Columns: Checked, Score (stars + raw score), Post (subject + snippet + keyword chips + link), Author, Posted (date), Replies, Kudos, Docs / Blog overlap, Why this score.
5. The **Docs / Blog overlap** column shows a verdict tag (`Active in docs` / `Partial match` / `Missing from docs`), a colored ratio bar, the matched-keyword count (N/total), a sample of matched terms, and the last-modified date of the most recent matching doc — so reviewers can see *why* the overlap score is what it is.
6. The **Why this score** column lists the individual signals that contributed to the score (e.g. "Posted 3.9 years ago", "No kudos in over a year", "Mentions deprecated: AppMon", "Topic actively documented").
7. The **Replies** and **Kudos** columns are separate, sortable, and render zero values in red as a quick "no interaction" cue.
8. Each row links directly to the original community post URL.
9. A "Checked" column with a checkbox so a real reviewer can mark posts they've inspected.
10. The upload area gives clear visual feedback when a CSV is selected — animated green check, filename + size, one-click remove button.
11. Sessions can be saved to disk and restored later; checkmark state persists with the session.

## Backend
1. Node.js + Express, single process, serves both the API and a static vanilla-JS frontend. Start with `npm start` → http://localhost:3000.
2. **No LLM / no Claude API** — outdatedness signal is computed from a cached crawl of `docs.dynatrace.com` and `dynatrace.com/news/blog`, keyword overlap (TF-IDF top 15 per post), last-modified freshness, and a curated deprecated-terms list.
3. **Thread starter detection**: a row is treated as an original post when `Parent Message URL` is empty. Replies (anything with a non-empty parent) are skipped by default; the UI has an "include replies" checkbox to override.
4. Persistent state on disk: `./cache/docs.json.gz` (gzip-compressed crawl, 7-day TTL, refreshable from the UI), `./sessions/<uuid>.json` (one file per session, includes per-post checkmark state and the full overlap breakdown).
5. Progress reporting uses Server-Sent Events from `/api/analyze/:id` so the frontend can show a live progress bar across 500–5,000 posts. The docs crawl uses an 8-worker concurrency limiter.
6. The scorer (`lib/scorer.js`) returns, per post: `rawScore`, `stars` (1–5), `reasons[]`, `keywords[]`, `docOverlapRatio`, `docOverlapMatched`, `docOverlapTotal`, `docOverlapMatchedTerms[]`, `docLatestMatchAt`, `docOverlapVerdict` (`stale` / `neutral` / `active`).
7. Dependencies: `express`, `multer`, `iconv-lite`, `papaparse`, `cheerio`, `p-limit`, `uuid`. No frontend framework — vanilla HTML/CSS/JS.

See [PLAN.md](./PLAN.md) for the full implementation plan, file layout, and scoring model.

## Style
1. Use dynatrace.com and community.dynatrace.com as insipration for the frontend - similar colors, button, and so on
2. Make it clear and readable, but don't be afraid of colors, fancy animations and a little bit of razzle-dazzle.
3. Do not use typical LLM/CLaude styling, make it similar to the real SaaS products

## Coding Best Practices
    Early Returns: Use to avoid nested conditions
    Descriptive Names: Use clear variable/function names (prefix handlers with "handle")
    Constants Over Functions: Use constants where possible
    DRY Code: Don't repeat yourself
    Functional Style: Prefer functional, immutable approaches when not verbose
    Minimal Changes: Only modify code related to the task at hand
    Function Ordering: Define composing functions before their components
    TODO Comments: Mark issues in existing code with "TODO:" prefix
    Simplicity: Prioritize simplicity and readability over clever solutions
    Build Iteratively Start with minimal functionality and verify it works before adding complexity
    Functional Code: Use functional and stateless approaches where they improve clarity
    Clean logic: Keep core logic clean and push implementation details to the edges
    File Organsiation: Balance file organization with simplicity - use an appropriate number of files for the project scale