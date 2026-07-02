---
name: analyze-post-context
description: Analyze a Dynatrace Community post export from the Archive Helper. For each post, read the actual subject + body and produce an independent keep/archive verdict, a confidence, a one-line summary, and reasoning — refining the tool's rule-based star score with real content understanding. Emits a re-importable JSON (overlays verdicts back into the Archive Helper UI) plus a prioritized markdown review report. Use when the user gives you an Archive Helper export (`*.json` or `*.csv`) and asks to review, refine, or LLM-analyze the posts.
---

# Analyze post context

You are refining the Archive Helper's **rule-based** archive score with genuine content
analysis. The tool scores posts 1★ (keep) → 5★ (archive candidate) from age, interaction,
deprecated-term mentions, and keyword overlap with docs.dynatrace.com / the Dynatrace Blog.
Those are signals, not judgement. Your job is to read what the post actually says and decide
whether it should be archived.

## Input

The user provides an **export from the Archive Helper** — prefer the `.json` (richer, reliable
to parse); the `.csv` carries the same columns. The JSON shape is:

```json
{
  "meta": { "sessionId": "...", "sourceFile": "...", "exportedAt": "...", "scope": "all", "count": 42 },
  "posts": [
    {
      "index": 0,
      "subject": "...", "body": "...full post text...",
      "url": "...", "author": "...", "postedAt": "2021-03-04T09:12:00.000Z",
      "replies": 0, "kudos": 0,
      "stars": 5, "rawScore": 4, "reasons": ["Posted 4.1 years ago (>3y threshold)", "..."],
      "keywords": ["..."],
      "docOverlapVerdict": "stale", "docOverlapMatched": 2, "docOverlapMatchedTerms": ["..."],
      "docLatestMatchUrl": "...", "docLatestMatchAt": "...", "docLatestMatchSource": "docs",
      "checked": false
    }
  ]
}
```

`index` is the stable key — it must survive unchanged into your output so the Archive Helper can
match verdicts back to the right post.

## How to judge each post

Read `subject` + `body` first, then weigh the metadata. Decide one of:

- **`archive`** — content is stale/obsolete, superseded by current docs, about a deprecated
  product (AppMon, Ruxit, dynaTrace 6/7, classic UI), a one-off question long since resolved with
  no lasting value, or a duplicate of well-documented material. Old + unanswered + off current docs
  is a strong archive signal.
- **`keep`** — still useful: a workable how-to/solution, a pattern not well covered in current
  docs, community-endorsed (kudos), or an actively discussed thread. Age alone is **not** a reason
  to archive if the content is still correct and useful.
- **`review`** — genuinely borderline or you lack context to be confident. Use sparingly; it exists
  so a human looks closer, not as a default dodge.

Actively look for cases where you **disagree with the star score** — those are the point of this
pass:
- A 5★ (rule-says-archive) post that is actually a still-valid solution → `keep`.
- A 1★–2★ post that is really a resolved trivial question about deprecated tech → `archive`.

`llmConfidence` is 0.0–1.0: how sure you are of the verdict. High (>0.8) when the body makes it
obvious; lower when you're inferring.

Group and note likely **duplicates / superseded** posts in the report (multiple posts on the same
narrow topic → keep the best, archive the rest).

## Output — write two files next to the input

**1. `<base>.llm-review.json`** — re-importable into the Archive Helper (its "Import LLM review"
button reads exactly this shape). One entry per post, matched by `index`:

```json
{
  "meta": { "sessionId": "<copy from input meta>", "analyzedAt": "<now ISO>", "model": "claude-opus-4-8" },
  "results": [
    {
      "index": 0,
      "llmVerdict": "archive",
      "llmConfidence": 0.9,
      "llmSummary": "Resolved AppMon 6 agent-install question; product retired, no lasting value.",
      "llmReasoning": "Body is a one-off install error for AppMon 6.5, answered inline in 2019. AppMon is EOL and superseded by Dynatrace SaaS; nothing here applies to current agents."
    }
  ]
}
```

Rules: emit a result for **every** post in the input. `llmVerdict` must be one of
`archive` / `keep` / `review`. `llmSummary` is one sentence (≤160 chars — it renders in a table
cell). `llmReasoning` is 1–3 sentences (shown on hover). Keep `index` exactly as given.

**2. `<base>.review-report.md`** — a prioritized report a moderator can act on:

- **Summary line**: N posts reviewed · X archive · Y keep · Z review · and how many verdicts
  **disagree** with the tool's star score.
- **Archive now** — table of confident `archive` verdicts (Subject · Author · Posted · Stars ·
  Confidence · Why), highest confidence first, linked to the post URL.
- **Disagreements** — posts where you overrode the rule-based score, each with a one-line rationale.
  This is the most valuable section; lead the reader to it.
- **Needs human review** — the `review` verdicts and why they're borderline.
- **Likely duplicates / superseded** — any clusters you found.

(`<base>` = the input filename without its extension, e.g. `csv_search_all_2026-07-02`.)

## Workflow

1. Read the input file. If given the `.csv`, parse it; if both, use the `.json`.
2. For large exports, work through posts in batches so you actually read each body — do not
   pattern-match on stars alone. The whole point is that you read content the scorer couldn't.
3. Write both output files.
4. Tell the user the file paths and the headline counts, and remind them they can load the
   `.llm-review.json` back into the Archive Helper via **Import LLM review** to see your verdicts
   overlaid in the results table.
