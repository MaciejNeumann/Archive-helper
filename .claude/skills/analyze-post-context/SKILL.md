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
      "replyPosts": [
        { "url": "...", "author": "Jane Doe", "postedAt": "2021-03-05T10:00:00.000Z", "subject": "Re: ...", "body": "Here is how I solved it: ..." }
      ],
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

`replyPosts` contains the actual bodies of all replies to the thread. It may be an empty array
for posts that received no replies, or for exports made before this feature was added.

## Default posture

**When in doubt, keep or review — never archive on uncertainty alone.**

Archive requires **positive evidence** that the content is obsolete or wrong. The absence of a
reply, the absence of a resolution, or the presence of a version number are not enough on their
own. The cost of a false archive (removing content that would have helped someone) is higher than
the cost of a false keep (retaining slightly stale content). If you can't clearly see that the
content has no value for anyone anymore, it should stay.

## How to judge each post

Read `subject` + `body` first, then read `replyPosts` (all replies in the thread), then weigh
the metadata. Decide one of:

- **`archive`** — the content has **clearly** lost all value: about a deprecated product (AppMon,
  Ruxit, dynaTrace 6/7, classic UI, Cloud Foundry/PCF, MiniShift, RHEL Atomic, DaemonSet-based
  OA install), version-specific errors for EOL platforms (OCP 3.x, K8s < 1.18), or demo-tool
  issues (easyTravel). Also archive a post that is a single trivial sentence with no replies and
  no content that couldn't be found in 10 seconds via docs search.
  Strong archive signals: **the product/platform itself is EOL or deprecated**, AND the post
  adds nothing (no troubleshooting steps, no config detail, no real-world context) beyond what
  a docs search returns. PCF/CF context is a reliable archive signal.

  **Confidence floor:** require `llmConfidence ≥ 0.80` to mark a post `archive`. If you are
  less confident (0.70–0.79) and the product/platform is NOT clearly EOL, use `review:stale`
  instead — the human reviewer can make the final call.

  **Mentioning a version number does NOT make a post obsolete.** Archive only when the
  product/platform is EOL — not because a version number appears incidentally in a post about a
  concept that still applies.

  **Doc/blog overlap is NOT an archive signal.** A community post on the same topic as docs or
  a blog post is healthy — different users prefer different knowledge sources. Archive only when
  the *content itself* is obsolete or incorrect, not because documentation also covers the topic.

- **`keep`** — still useful: a workable how-to or solution pattern, recurring operational challenge
  (certs, network isolation, service mesh, non-privileged containers, multi-cluster scale),
  community-endorsed content (kudos ≥ 1), or an actively discussed thread (replies ≥ 5).
  Age alone is **not** a reason to archive if the content is still correct and useful.
  Being covered in current docs is **not** a reason to archive either.
  **A reply that contains a working solution or confirms a resolution is a strong keep signal** —
  even if the original question looks unresolved, a reply saying "this fixed it: …" or providing
  concrete steps means the thread has lasting value. Read `replyPosts` carefully before deciding.
  **The following reply types are also strong keep signals — even when no solution exists:**
  a reply confirming "this is not possible / not supported" (saves others from dead-end investigation);
  a reply correcting a misconception ("you're thinking about this wrong; the correct approach is…");
  a reply confirming a known limitation with an RFE link (others can +1 instead of filing duplicates);
  a Dynatrace employee confirming "by design" behavior (prevents unnecessary support tickets);
  a reply redirecting to the correct alternative ("don't use X for this, use Y instead");
  a reply stating "fixed in version X" (tells users whether they need to upgrade).

- **`review:stale`** — the **topic is still valid and current**, but the specific answer (API v1
  endpoint, old UI navigation path, "coming soon" feature that has since shipped, version-specific
  behavior that may have changed, pricing/licensing figures from 3+ years ago) may now be wrong
  or misleading. A moderator can verify quickly against current docs. Use this instead of `archive`
  when you are unsure whether the staleness makes the answer actively harmful vs. merely outdated.
  Examples: reply references `/api/v1/synthetic/monitors` (v1 API, largely superseded by v2);
  reply describes a UI menu path from 2018 that no longer matches; reply says "coming soon" for
  a feature that shipped years ago; "not possible" answer from 5+ years ago that may now exist.

- **`review:uncertain`** — genuinely unclear whether the content has value and **human domain
  knowledge is required** to decide. Use when you cannot tell from the text alone whether the
  technology is current, whether the limitation described still exists, or whether the question
  represents a real ongoing pain point. Reserve for cases where a Dynatrace SME would know
  immediately but you cannot determine from context.
  Examples: long unanswered question about a niche configuration with no replies; a thread where
  technology is current but the resolution is ambiguous; any post less than 18 months old that is
  not about a clearly deprecated product.

  **Do not use `review:uncertain` as a lazy default** when the content is obviously stale or
  obsolete — use `review:stale` for stale-answer cases, `archive` for clearly dead content.

**Recency protection:** posts less than 18 months old almost certainly describe current product
behavior and active user pain points. Do not archive them unless the technology in the post is
clearly deprecated (e.g. a post about AppMon published last year). Default to `keep` or
`review:uncertain`.

Actively look for cases where you **disagree with the star score** — those are the point of this
pass:
- A 5★ (rule-says-archive) post that is actually a still-valid solution → `keep`.
- A 1★–2★ post about a truly deprecated product with no useful content → `archive`.

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
`archive` / `keep` / `review:stale` / `review:uncertain` (bare `review` is also accepted for
backward compatibility). `llmSummary` ≤160 chars (renders in a table cell).
`llmReasoning` is 1–3 sentences (shown on hover). Keep `index` exactly as given.

**2. `<base>.review-report.md`** — a prioritized report a moderator can act on:

- **Summary line**: N posts reviewed · X archive · Y keep · Z review:stale · W review:uncertain
  · and how many verdicts **disagree** with the tool's star score.
- **Disagreements** — posts where you overrode the rule-based score. Lead with this section
  when disagreements exist. When the score distribution is **homogeneous** (>90% of posts at
  the same star level, zero or near-zero disagreements), skip this section and instead lead with
  **"Archive candidates hidden in the ★ mass"** — a table of confident `archive` verdicts the
  rule-based scorer missed because all posts scored similarly.
- **Stale answers to verify** — `review:stale` verdicts grouped by staleness type (old API
  version, old UI path, "coming soon" language, outdated limitation). Moderator can batch-verify
  these against current docs quickly.
- **Needs human review** — `review:uncertain` verdicts and why they're borderline.
- **Archive now** — table of confident `archive` verdicts, highest confidence first.
- **Posts to keep** — brief table of keep verdicts.
- **Likely duplicates / superseded** — output of the deduplication pass (Step 3).

(`<base>` = input filename without extension, e.g. `csv_search_all_2026-07-02`.)

---

## Workflow

### Step 1 — Inspect the input

Use Node.js via Bash/PowerShell to count posts and extract a compact manifest:

```js
const data = JSON.parse(require('fs').readFileSync('<path>', 'utf8'));
console.log('Posts:', data.posts.length, '| Session:', data.meta.sessionId);
const dist = data.posts.reduce((a, p) => { a[p.stars] = (a[p.stars]||0)+1; return a; }, {});
console.log('Stars:', JSON.stringify(dist));
// Detect homogeneous distribution
const total = data.posts.length;
const maxBucket = Math.max(...Object.values(dist));
if (maxBucket / total > 0.9) console.log('NOTE: homogeneous score distribution — adapt report accordingly');
```

### Step 2 — Choose small or batch mode

| Post count | Mode |
|---|---|
| ≤ 40 posts | **Small** — read all bodies directly in one pass |
| > 40 posts | **Batch (parallel)** — spawn up to 5 batch agents simultaneously, each covering 30 posts |

### Small mode (≤ 40 posts)

Read the input file directly. Analyze all post subjects and bodies. Skip to Step 3.

### Batch mode (> 40 posts)

Process in batches of 30 posts. Launch up to **5 batches in parallel** per round using the Agent
tool — each agent reads its 30 posts and **writes its results to a file** (not the return value).

**Step A — Pre-write ALL batch input files at once:**

```js
const fs = require('fs');
const BATCH_SIZE = 30;
const data = JSON.parse(fs.readFileSync('<INPUT_PATH>', 'utf8'));
const totalBatches = Math.ceil(data.posts.length / BATCH_SIZE);
for (let b = 1; b <= totalBatches; b++) {
  const slice = data.posts.slice((b - 1) * BATCH_SIZE, b * BATCH_SIZE);
  fs.writeFileSync(`<BASE>.batch-${b}-of-${totalBatches}.tmp.json`, JSON.stringify(slice, null, 2));
}
console.log('Written', totalBatches, 'batch files');
```

**Step B — Process in parallel rounds of 5:**

For each round (batches 1–5, then 6–10, …):

1. **Send one message with up to 5 Agent tool calls** — one per batch in the round. All 5 run
   concurrently. Each agent reads its input file, analyzes every post, and **writes its results
   to `<BASE>.batch-N.results.json`**. The agent returns a short confirmation string, not the
   full JSON — the orchestrator reads the file directly.

2. **Wait for all agents in the round to finish**, then read each results file:

```js
const roundResults = [];
for (const b of roundBatches) {
  const path = `<BASE>.batch-${b}-of-${totalBatches}.results.json`;
  const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
  roundResults.push(...arr);
}
allResults.push(...roundResults);
```

3. **Crash recovery:** results files are the checkpoint — if restarting, check which
   `*.results.json` files already exist and skip those batches.

4. Print a round progress line:
   ```
   [Round 2 / 3]  batches 6–10  →  47 archive · 82 keep · 21 review:stale · 15 review:uncertain  ✓  (150 done, 300 remaining)
   ```

5. Proceed to the next round.

After all rounds complete, delete all `*.tmp.json` and `*.results.json` batch files.

---

### Batch agent prompt template

Pass the following as the `prompt` to each Agent tool call. Fill in all `{{…}}` placeholders
before spawning.

```
You are a batch analyzer for the Archive Helper tool.
Batch {{BATCH_N}} of {{TOTAL_BATCHES}} — posts {{BATCH_START}}–{{BATCH_END}} of {{TOTAL_POSTS}} total.

## Your task

1. Read the batch input file at:
   {{BATCH_FILE_PATH}}

2. For each post, read its `subject`, `body`, and `replyPosts`, then produce a verdict.

3. Write your results as a JSON array to:
   {{RESULTS_FILE_PATH}}

   The file must contain valid JSON — no markdown fences, no explanation, just the array.

4. Return the single line: DONE: {{BATCH_N}}/{{TOTAL_BATCHES}} — N results written.

## Output format (write to file)

[
  {
    "index": <integer — keep exactly as given, do NOT change>,
    "llmVerdict": "archive" | "keep" | "review:stale" | "review:uncertain",
    "llmConfidence": <0.0–1.0>,
    "llmSummary": "<one sentence ≤160 chars — renders in a table cell>",
    "llmReasoning": "<1–3 sentences — shown on hover>"
  },
  ...
]

Emit one object per post. Do not skip any post.

## Default posture

**When in doubt, keep or review — never archive on uncertainty alone.**
Archive requires positive evidence that the content is obsolete or wrong. Absence of a reply or
a resolution is NOT enough on its own. If you can't clearly see that the content has no value
for anyone anymore, choose `review:stale` or `review:uncertain`, not `archive`.

**Recency protection:** posts less than 18 months old should not be archived unless the
technology in the post is clearly deprecated (e.g. AppMon, PCF). Default to `keep` or
`review:uncertain`.

## Verdict criteria

**archive** — the content has clearly lost all value: about a deprecated product/platform
  (AppMon, Ruxit, dynaTrace 6/7, classic UI, Cloud Foundry/PCF, MiniShift, RHEL Atomic,
  DaemonSet-based OA install) OR an EOL platform version (OCP 3.x, K8s < 1.18) OR a demo tool
  (easyTravel). Also archive a post that is a single trivial sentence with no replies, no
  troubleshooting detail, and no real-world context beyond what a docs search returns.
  **Confidence floor: only use `archive` when `llmConfidence ≥ 0.80`.** If you are at 0.70–0.79
  and the product/platform is not clearly EOL, use `review:stale` instead.
  PCF/CF context is a reliable archive signal.
  **Mentioning a version number does NOT make a post obsolete.** Archive only when the
  product/platform itself is EOL.
  **Doc/blog overlap is NOT an archive signal.**

**keep** — still useful despite age: workable solution or how-to, recurring operational
  challenge (certs, network isolation, service mesh, non-privileged containers, multi-cluster
  scale, Go monitoring limitations, Istio coexistence), community-endorsed (kudos ≥ 1), or
  actively discussed (replies ≥ 5). Age alone is NOT a reason to archive if the content remains
  correct. Being covered in current docs is NOT a reason to archive either.
  **Replies that contain working solutions, confirmed workarounds, or actionable steps are a
  strong keep signal.**

**review:stale** — the **topic is still valid**, but the specific answer in the replies may be
  wrong or misleading today. Use this when you see:
  - Reply references an old API version (v1 endpoint superseded by v2)
  - Reply describes a UI navigation path that has changed
  - Reply says "this is coming soon" or "work in progress" for a feature that has since shipped
  - Reply says "not possible" for something that may have been added in the last 3+ years
  - Reply cites pricing/licensing figures from 3+ years ago
  - Reply references a docs URL that has since moved
  **Do NOT use `review:stale` for clearly EOL content** (that's `archive`). Use it when the
  question is timeless but the answer may need a doc check.

**review:uncertain** — your safe fallback when genuinely unsure and **human domain knowledge
  would change the verdict**. Use when:
  — detailed unanswered question (long body, error messages, logs, config snippets) with no
    replies: it documents a real pain point even without an answer;
  — technology is current but resolution is unclear;
  — any post less than 18 months old that is not about a clearly deprecated product;
  — you cannot determine from context whether the described behavior still applies.
  **Do not use `review:uncertain` when `review:stale` fits** — if the topic is valid but the
  answer is the stale part, `review:stale` is more specific and more useful to the moderator.

## The "stale answer but valid topic" pattern

This is the most common case in Dynatrace community posts. Recognize it:
- The original question describes a current, ongoing challenge (monitoring certs, configuring
  MFA, working with synthetic scripting API, etc.)
- The accepted/top reply gives concrete steps, BUT those steps reference old API versions,
  old UI paths, outdated version numbers, or features that weren't yet available

**Correct verdict: `review:stale`** — not `archive` (topic is valid), not `keep` (answer may
actively mislead), not `review:uncertain` (the issue is clear: the answer is dated).

REVIEW:STALE example (confidence 0.72):
  Subject: "How to query synthetic monitor availability data via API"
  replyPosts: [{ body: "Use GET /api/v1/timeseries/com.dynatrace.builtin:synthetic.availability..." }]
  Verdict: review:stale — the question (querying availability data) is a valid ongoing need.
  The answer references the v1 Timeseries API which was deprecated in favor of Metrics v2.
  A moderator should verify against current API docs.

REVIEW:STALE example (confidence 0.68):
  Subject: "Can I use scripted HTTP monitors in Dynatrace?"
  replyPosts: [{ body: "We're working on this feature, it will be available very soon!" }]
  Verdict: review:stale — scripted HTTP monitors have been available for years; the reply
  incorrectly implies the feature doesn't exist yet. Actively misleads current users.

## How to evaluate replyPosts

**Useful reply signals — lean keep (even without a working solution):**
- Concrete steps or commands that solve the issue
- "This worked for me" + description of what was done
- A workaround for a known limitation
- "This is not possible / not supported" — confirms a feature gap (unless very old, then review:stale)
- Misconception corrected
- Known limitation + RFE filed
- "By design" from a Dynatrace employee
- "Use X instead of Y" — redirects to correct alternative
- "Fixed in version X"

**Non-useful reply signals — do not prevent archive:**
- "Me too", "did you ever solve this?", "+1", "I have the same issue"
- One-line acknowledgement with no technical content
- Out-of-office auto-replies
- Bare links without any explanation

**Mixed:** a reply that partially helps but references further follow-up — lean review:uncertain.

## Calibration examples

ARCHIVE (confidence 0.88):
  Subject: "Deploying OneAgent on IBM Kubernetes IKS v1.10/1.11"
  replyPosts: [{ body: "Same issue here, waiting for a fix." }]
  Verdict: archive — IKS v1.10/1.11 are years past K8s EOL; the only reply is a "me too".

KEEP (confidence 0.85):
  Subject: "Configuring trusted root certificates on ActiveGate for K8s cluster SSL"
  replyPosts: [{ body: "I resolved this by running: keytool -import -trustcacerts ..." }]
  Verdict: keep — concrete keytool steps; certificate trust for K8s monitoring is recurring.

KEEP — not possible (confidence 0.82):
  Subject: "Can I filter CloudWatch metrics by tag before they're ingested into Dynatrace?"
  replyPosts: [{ body: "This is not currently supported. Tag filtering happens after ingestion." }]
  Verdict: keep — definitively answers that pre-ingestion filtering is not possible.

KEEP — by design (confidence 0.83):
  Subject: "Why does Dynatrace show a separate DB instance for every pod using Cloud SQL proxy?"
  replyPosts: [{ body: "This is expected behavior — DT identifies DB services by IP... it's by design." }]
  Verdict: keep — authoritative "by design" explanation prevents others from filing support tickets.

REVIEW:STALE (confidence 0.72):
  Subject: "How to query synthetic monitor availability data via API"
  replyPosts: [{ body: "Use GET /api/v1/timeseries/com.dynatrace.builtin:synthetic.availability..." }]
  Verdict: review:stale — valid question, but v1 Timeseries API was deprecated; answer may mislead.

REVIEW:STALE (confidence 0.68):
  Subject: "Can I use scripted HTTP monitors in Dynatrace?"
  replyPosts: [{ body: "We're working on this feature, it will be available very soon!" }]
  Verdict: review:stale — HTTP monitors have been available for years; reply actively misleads.

REVIEW:UNCERTAIN (confidence 0.55):
  Subject: "Official DT recommendations for deploying via Flux or ArgoCD"
  replyPosts: [{ body: "I'd also like to know this." }]
  Verdict: review:uncertain — valid current question, single "me too" reply, no resolution.
```

---

### Step 3 — Deduplication pass

After all batch results are collected, run **one small Agent** to find duplicate/superseded post
clusters. This agent does NOT need to re-read post bodies — it works from subjects and summaries.

Build a compact manifest and pass it to the agent:

```js
// Write dedup manifest
const manifest = allResults.map(r => {
  const post = postMap[r.index];
  return { index: r.index, subject: post.subject, llmVerdict: r.llmVerdict, llmSummary: r.llmSummary };
});
fs.writeFileSync('<BASE>.dedup-manifest.json', JSON.stringify(manifest, null, 2));
```

Agent prompt:
```
Read the manifest at: <BASE>.dedup-manifest.json

Each entry has: index, subject, llmVerdict, llmSummary.

Find clusters of posts that cover the same narrow topic (same question asked multiple times, or
posts that would be superseded if one definitive thread existed). For each cluster, identify
which post to keep (most complete answer, or most recent if answers are similar).

Return a JSON array of clusters:
[
  {
    "topic": "one-line description of the shared topic",
    "keepIndex": <index of the best post to keep>,
    "duplicateIndexes": [<indexes of the weaker duplicates>],
    "reason": "why the keep post is better than the others"
  }
]

Only flag genuine topic duplicates — posts that are so similar in subject that keeping both
adds no value. Don't flag posts that merely touch the same area of the product.
```

After the agent returns, write the clusters to `<BASE>.dedup-clusters.json` and include them in
the review report. Delete the dedup manifest file.

---

### Step 4 — Write output files and report to the user

After all results are collected and deduplication is done, write the two output files using a
Node.js script (write to a `.js` file and execute it — do not embed large data in `node -e`).

The report structure adapts to the data:

**When score distribution is homogeneous** (>90% same star level, ≤2 disagreements):
1. Summary line
2. **Archive candidates hidden in the ★ mass** — confident archive verdicts (lead with these,
   since disagreements section would be empty)
3. Stale answers to verify (review:stale)
4. Needs human review (review:uncertain)
5. Posts to keep
6. Likely duplicates / superseded

**When disagreements exist** (normal distribution):
1. Summary line
2. **Disagreements** — posts where LLM overrode rule-based score (lead with this)
3. Stale answers to verify (review:stale)
4. Needs human review (review:uncertain)
5. Archive now
6. Posts to keep
7. Likely duplicates / superseded

Tell the user:
- The two file paths
- Headline counts: N archive · N keep · N review:stale · N review:uncertain
- Number of disagreements with the rule-based stars
- Reminder: load `<base>.llm-review.json` via **Import LLM review** in the Archive Helper app
