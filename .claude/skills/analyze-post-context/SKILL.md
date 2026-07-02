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
  product (AppMon, Ruxit, dynaTrace 6/7, classic UI, Cloud Foundry/PCF, MiniShift, RHEL Atomic,
  DaemonSet-based OA install), a one-off question long since resolved with no lasting value, or a
  duplicate of well-documented material. Strong archive signals: no resolution posted,
  version-specific errors for EOL versions (OCP 3.x, DT 1.x–1.70, K8s < 1.18), demo-tool issues
  (easyTravel), basic FAQs fully answered in current docs.
- **`keep`** — still useful: a workable how-to or solution pattern, recurring operational challenge
  (certs, network isolation, service mesh, non-privileged containers, multi-cluster scale),
  community-endorsed content (kudos ≥ 1), or an actively discussed thread (replies ≥ 5).
  Age alone is **not** a reason to archive if the content is still correct and useful.
- **`review`** — genuinely borderline: current doc status is unclear, or you cannot judge without
  knowing whether the described issue was resolved. Use sparingly — not as a dodge for uncertainty.

Actively look for cases where you **disagree with the star score** — those are the point of this
pass:
- A 5★ (rule-says-archive) post that is actually a still-valid solution → `keep`.
- A 1★–2★ post that is really a resolved trivial question about deprecated tech → `archive`.

`llmConfidence` is 0.0–1.0: how sure you are of the verdict. High (>0.8) when the body makes it
obvious; lower when you're inferring.

Group and note likely **duplicates / superseded** posts in the report (multiple posts on the same
narrow topic → keep the best, archive the rest).

## Output — write two files next to the input

**1. `<base>.llm-review.json`** — re-importable into the Archive Helper via "Import LLM review":

```json
{
  "meta": { "sessionId": "<copy from input meta>", "analyzedAt": "<now ISO>", "model": "claude-sonnet-4-6" },
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
`archive` / `keep` / `review`. `llmSummary` ≤160 chars (renders in a table cell).
`llmReasoning` is 1–3 sentences (shown on hover). Keep `index` exactly as given.

**2. `<base>.review-report.md`** — a prioritized report a moderator can act on:

- **Summary line**: N posts reviewed · X archive · Y keep · Z review · and how many verdicts
  **disagree** with the tool's star score.
- **Disagreements** — posts where you overrode the rule-based score. Lead with this — it's the
  highest-value section.
- **Needs human review** — the `review` verdicts and why they're borderline.
- **Archive now** — table of confident `archive` verdicts, highest confidence first, linked to URLs.
- **Posts to keep** — brief table of keep verdicts.
- **Likely duplicates / superseded** — clusters of posts on the same narrow topic.

(`<base>` = input filename without extension, e.g. `csv_search_all_2026-07-02`.)

---

## Workflow

### Step 1 — Inspect the input

Use Node.js via Bash/PowerShell to count posts and extract a compact manifest so you know what
you are working with before processing:

```js
const data = JSON.parse(require('fs').readFileSync('<path>', 'utf8'));
console.log('Posts:', data.posts.length, '| Session:', data.meta.sessionId);
const dist = data.posts.reduce((a, p) => { a[p.stars] = (a[p.stars]||0)+1; return a; }, {});
console.log('Stars:', JSON.stringify(dist));
```

### Step 2 — Choose small or batch mode

| Post count | Mode |
|---|---|
| ≤ 40 posts | **Small** — read all bodies directly in one pass |
| > 40 posts | **Batch** — spawn one sub-agent per batch of 30 posts (sequential) |

### Small mode (≤ 40 posts)

Read the input file directly. Analyze all post subjects and bodies. Produce the two output files.

### Batch mode (> 40 posts)

The context window cannot hold hundreds of post bodies. Process in batches of 30 using the Agent
tool. Each batch agent gets a clean context window, reads its posts fully, returns verdicts. You
collect and merge.

**For each batch (in sequence):**

1. Extract the batch's posts from the input JSON using a Node.js script and write them to a temp
   file next to the input (e.g. `<base>.batch-1-of-12.tmp.json`):

```js
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('<INPUT_PATH>', 'utf8'));
const BATCH_SIZE = 30;
const start = (BATCH_N - 1) * BATCH_SIZE;
const slice = data.posts.slice(start, start + BATCH_SIZE);
fs.writeFileSync('<BATCH_TMP_PATH>', JSON.stringify(slice, null, 2));
console.log('Written', slice.length, 'posts to batch file');
```

2. **Spawn an Agent** using the Agent tool with the batch prompt below. The prompt tells the agent
   to read the temp file, analyze every post, and return a raw JSON array.

3. **Parse the agent's return value** as JSON. If it wraps output in markdown fences, strip them.
   Validate that it's an array with `index` fields.

4. Append the batch results to your `allResults` array.

5. **Write a checkpoint file** immediately after each batch:

```js
fs.writeFileSync('<base>.checkpoint.json', JSON.stringify(allResults, null, 2));
```

6. **Delete the temp batch file** (it is now redundant).

7. Print a progress line:
   ```
   [Batch  3 / 12]  posts  61–90   →  21 archive · 7 keep · 2 review  ✓  (93 done, 267 remaining)
   ```

8. Proceed to the next batch.

After all batches complete, delete the checkpoint file and write the two final output files.

---

### Batch agent prompt template

Pass the following as the `prompt` to each Agent tool call. Fill in all `{{…}}` placeholders
before spawning.

```
You are a batch analyzer for the Archive Helper tool.
Batch {{BATCH_N}} of {{TOTAL_BATCHES}} — {{BATCH_START}}–{{BATCH_END}} of {{TOTAL_POSTS}} posts total.

## Your task

Read the batch file at this path:
  {{BATCH_FILE_PATH}}

It is a JSON array of Dynatrace Community posts. For each post, read its subject and body,
then produce a verdict. Return ONLY a raw JSON array (no markdown fences, no explanation):

[
  {
    "index": <integer — keep exactly as given, do NOT change>,
    "llmVerdict": "archive" | "keep" | "review",
    "llmConfidence": <0.0–1.0>,
    "llmSummary": "<one sentence ≤160 chars explaining your verdict — renders in a table cell>",
    "llmReasoning": "<1–3 sentences expanded reasoning — shown on hover>"
  },
  ...
]

Emit one object per post. Do not skip any post.

## Verdict criteria

**archive** — stale/obsolete: superseded by current docs, about deprecated products
  (AppMon, Ruxit, dynaTrace 6/7, classic UI, Cloud Foundry/PCF, MiniShift, RHEL Atomic,
  DaemonSet-based OA install), a one-off unresolved question with no lasting value,
  or a basic FAQ now fully answered in documentation.
  Strong archive signals: no resolution posted, version-specific errors for EOL versions
  (OCP 3.x, DT 1.x–1.70, K8s < 1.18), demo tool issues (easyTravel), PCF/CF context.

**keep** — still useful despite age: workable solution or how-to, pattern not fully covered
  in current docs, community-endorsed (kudos ≥ 1), actively discussed (replies ≥ 5),
  or a recurring operational challenge (certs, network isolation, service mesh,
  non-privileged containers, multi-cluster scale, Go monitoring limitations, Istio coexistence).
  Age alone is NOT a reason to archive if the content remains correct.

**review** — genuinely borderline: current doc status is unclear, or you cannot judge
  without knowing the resolution. Use sparingly — not as a default for uncertainty.

Look for disagreements with the rule-based star score — those are the point of this pass.
A 5★ post that is actually a still-valid solution → keep.
A 1★–2★ post about truly deprecated tech → archive.

## Calibration examples (apply the same standard)

ARCHIVE (confidence 0.88):
  Subject: "Deploying OneAgent on IBM Kubernetes IKS v1.10/1.11"
  Verdict: archive — IKS v1.10/1.11 are years past K8s EOL; install method and errors are
  entirely obsolete.

KEEP (confidence 0.85):
  Subject: "Configuring trusted root certificates on ActiveGate for K8s cluster SSL"
  Verdict: keep — shows a concrete PKIX failure and keytool steps for private-CA K8s clusters.
  Certificate trust for K8s monitoring is a recurring enterprise pain point.

REVIEW (confidence 0.55):
  Subject: "Official DT recommendations for deploying via Flux or ArgoCD"
  Verdict: review — DT may have published GitOps guidance since this was asked; unclear without
  checking current docs.
```

---

### Step 3 — Write output files and report to the user

After all results are collected, write:
1. `<base>.llm-review.json`
2. `<base>.review-report.md`

Use a Node.js script to generate both files from the merged results and the input data. Write the
script to a `.js` file and execute it — do not try to embed large data in a `node -e` argument
(the shell argument buffer is limited to ~32 KB on Windows).

Tell the user:
- The two file paths
- Headline counts: N archive · N keep · N review
- Number of disagreements with the rule-based stars
- Reminder: load `<base>.llm-review.json` via **Import LLM review** in the Archive Helper app
