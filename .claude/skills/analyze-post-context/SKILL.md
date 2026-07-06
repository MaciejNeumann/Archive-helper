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
        { "author": "Jane Doe", "postedAt": "2021-03-05T10:00:00.000Z", "subject": "Re: ...", "body": "Here is how I solved it: ..." }
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

- **`review`** — use this as your **safe fallback** whenever you are genuinely uncertain. Archive
  requires positive evidence of obsolescence; if that evidence is absent or ambiguous, choose
  `review` over `archive`. Specific cases that should be `review` rather than `archive`:
  — a detailed unanswered question (long body, error messages, logs, config snippets) with no
    replies: it documents a real pain point even without an answer, route to human review;
  — a thread where the technology is current but the resolution is unclear;
  — any post less than 18 months old that is not about a clearly deprecated product.
  Do not use `review` as a lazy default when the content is obviously obsolete — reserve it for
  cases where a human's domain knowledge would genuinely change the verdict.

**Recency protection:** posts less than 18 months old almost certainly describe current product
behavior and active user pain points. Do not archive them unless the technology in the post is
clearly deprecated (e.g. a post about AppMon published last year). Default to `keep` or `review`.

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
| > 40 posts | **Batch (parallel)** — spawn up to 5 batch agents simultaneously, each covering 30 posts |

### Small mode (≤ 40 posts)

Read the input file directly. Analyze all post subjects and bodies. Produce the two output files.

### Batch mode (> 40 posts)

Process in batches of 30 posts. Launch up to **5 batches in parallel** per round using the Agent
tool — each agent gets a clean context window, reads its 30 posts fully, returns verdicts. You
collect and merge after each round, then start the next.

**Step A — Pre-write ALL batch temp files at once** using a single Node.js script:

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

For each round (batches 1–5, then 6–10, then 11–15, …):

1. **Send one message with up to 5 Agent tool calls** — one per batch in the round. All 5 run
   concurrently. Each agent reads its temp file, analyzes every post, and returns a raw JSON array.

2. **Wait for all agents in the round to finish**, then parse each result. Strip markdown fences
   if present. Validate each is an array with `index` fields.

3. Append all round results to your `allResults` array.

4. **Write a checkpoint file** after each round:

```js
fs.writeFileSync('<BASE>.checkpoint.json', JSON.stringify(allResults, null, 2));
```

5. Print a round progress line:
   ```
   [Round 2 / 3]  batches 6–10  →  47 archive · 82 keep · 21 review  ✓  (150 done, 300 remaining)
   ```

6. Proceed to the next round.

After all rounds complete, delete the checkpoint file and write the two final output files.

**Crash recovery:** if you need to resume after a failure, read the checkpoint to find how many
results were already collected, skip those batches, and resume from the next unprocessed batch.

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

It is a JSON array of Dynatrace Community posts. For each post, read its `subject`, `body`,
and `replyPosts` (all replies in the thread), then produce a verdict.
Return ONLY a raw JSON array (no markdown fences, no explanation):

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

## Default posture

**When in doubt, keep or review — never archive on uncertainty alone.**
Archive requires positive evidence that the content is obsolete or wrong. Absence of a reply or
a resolution is NOT enough on its own. If you can't clearly see that the content has no value
for anyone anymore, choose `review`, not `archive`.

**Recency protection:** posts less than 18 months old should not be archived unless the
technology in the post is clearly deprecated (e.g. AppMon, PCF). Default to `keep` or `review`.

## Verdict criteria

**archive** — the content has clearly lost all value: about a deprecated product/platform
  (AppMon, Ruxit, dynaTrace 6/7, classic UI, Cloud Foundry/PCF, MiniShift, RHEL Atomic,
  DaemonSet-based OA install) OR an EOL platform version (OCP 3.x, K8s < 1.18) OR a demo tool
  (easyTravel). Also archive a post that is a single trivial sentence with no replies, no
  troubleshooting detail, and no real-world context beyond what a docs search returns.
  Strong archive signal: the product/platform is EOL AND the post adds nothing original.
  PCF/CF context is a reliable archive signal.

  **Mentioning a version number does NOT make a post obsolete.** Only archive when the
  product/platform itself is EOL — not because a version appears incidentally in a post about
  a concept that still applies.

  **Doc/blog overlap is NOT an archive signal.** Archive only when the content itself is
  obsolete or incorrect — not because docs or a blog post also covers the topic. Having the
  same knowledge in community + docs + blog is healthy; different users prefer different sources.

**keep** — still useful despite age: workable solution or how-to, recurring operational
  challenge (certs, network isolation, service mesh, non-privileged containers, multi-cluster
  scale, Go monitoring limitations, Istio coexistence), community-endorsed (kudos ≥ 1), or
  actively discussed (replies ≥ 5). Age alone is NOT a reason to archive if the content remains
  correct. Being covered in current docs is NOT a reason to archive either.
  **Replies that contain working solutions, confirmed workarounds, or actionable steps are a
  strong keep signal.** A thread where the original question looks stale but a reply says
  "this fixed it for me: …" or provides concrete steps still has lasting value.

**review** — your safe fallback whenever you are genuinely uncertain. Specific cases that
  should be `review` rather than `archive`:
  — detailed unanswered question (long body, error messages, logs, config snippets) with no
    replies: it documents a real pain point even without an answer;
  — technology is current but resolution is unclear;
  — any post less than 18 months old that is not about a clearly deprecated product.
  Do not use `review` when the content is obviously obsolete — reserve it for cases where a
  human's domain knowledge would genuinely change the verdict.

Look for disagreements with the rule-based star score — those are the point of this pass.
A 5★ post that has a useful solution in the replies → keep.
A 1★–2★ post about a truly deprecated product with no useful content → archive.

## How to evaluate replyPosts

Each entry in `replyPosts` has: `author`, `postedAt`, `subject`, `body`.

**Useful reply signals — lean keep (even without a working solution):**
- Concrete steps or commands that solve the issue
- "This worked for me" + description of what was done
- A workaround for a known limitation
- **"This is not possible / not supported"** — confirms a feature gap and saves others from
  dead-end investigation. The absence of a solution is itself useful community knowledge.
- **Misconception corrected** — a reply that says "you're thinking about this wrong; the
  correct approach is…" has lasting value for anyone with the same misunderstanding.
- **Known limitation + RFE filed** — a reply confirming this is a documented product gap
  with a product idea link. Others can +1 the same request and avoid duplicate tickets.
- **"By design" from a Dynatrace employee** — authoritative confirmation that the behavior
  is intentional, not a bug. Saves others from filing support tickets or troubleshooting
  expected behavior.
- **"Use X instead of Y"** — the approach in the question is wrong or suboptimal and a reply
  redirects to the correct alternative. Prevents others from going down the same dead-end path.
- **"Fixed in version X"** — confirms a bug or gap was resolved in a specific release. Tells
  users when they can stop applying a workaround or whether they need to upgrade.

**Non-useful reply signals — do not prevent archive:**
- "Me too", "did you ever solve this?", "+1", "I have the same issue"
- One-line acknowledgement with no technical content
- Out-of-office auto-replies
- Bare links without any explanation of what they answer

**Mixed:** a reply that partially helps but references further follow-up — lean review.

## Calibration examples (apply the same standard)

ARCHIVE (confidence 0.88):
  Subject: "Deploying OneAgent on IBM Kubernetes IKS v1.10/1.11"
  replyPosts: [{ body: "Same issue here, waiting for a fix." }]
  Verdict: archive — IKS v1.10/1.11 are years past K8s EOL; install method and errors are
  entirely obsolete. The only reply is a "me too" with no solution.

KEEP (confidence 0.85):
  Subject: "Configuring trusted root certificates on ActiveGate for K8s cluster SSL"
  replyPosts: [{ body: "I resolved this by running: keytool -import -trustcacerts ..." }]
  Verdict: keep — original question describes a PKIX failure; reply provides concrete keytool
  steps. Certificate trust for K8s monitoring is a recurring enterprise pain point.

KEEP from reply (confidence 0.80):
  Subject: "Lambda Java cold-start timeout after DT layer initializes"
  replyPosts: [{ body: "We fixed this by setting DT_LAMBDA_COLD_START_TIMEOUT=5000 in env vars." }]
  Verdict: keep — original body shows a hang after OTel init; reply provides the exact env var
  fix. The solution is actionable for anyone hitting the same Lambda cold-start issue.

KEEP — not possible (confidence 0.82):
  Subject: "Can I filter CloudWatch metrics by tag before they're ingested into Dynatrace?"
  replyPosts: [{ body: "This is not currently supported. Tag filtering happens after ingestion." }]
  Verdict: keep — the reply definitively answers that pre-ingestion filtering is not possible.
  This saves others from investigating a non-existent feature and documents a known limitation.

KEEP — misconception corrected (confidence 0.80):
  Subject: "My service naming rules aren't splitting services into separate entities"
  replyPosts: [{ body: "Naming rules change the display name but not the service identity.
    You need process group detection rules to actually split services." }]
  Verdict: keep — the reply corrects a common misunderstanding about naming vs. detection rules.
  Anyone who hits the same wall will benefit from this clarification.

KEEP — known limitation + RFE (confidence 0.78):
  Subject: "Is there a way to see DDU consumption broken down per Azure subscription?"
  replyPosts: [{ body: "Not possible today — per-subscription DDU breakdown isn't exposed.
    I've raised a product idea here: [link]" }]
  Verdict: keep — confirms an unresolved billing visibility gap and links the RFE. Useful for
  others who want the same feature and should +1 the idea rather than file a duplicate.

KEEP — by design (confidence 0.83):
  Subject: "Why does Dynatrace show a separate DB instance for every pod using Cloud SQL proxy?"
  replyPosts: [{ body: "This is expected behavior — DT identifies DB services by IP, and the
    proxy assigns a unique IP per pod. It's by design, not a bug." }]
  Verdict: keep — authoritative "by design" explanation prevents others from filing support
  tickets for expected behavior in a common GKE/Cloud SQL topology.

KEEP — redirect to correct approach (confidence 0.82):
  Subject: "Using the v1 /entity/infrastructure/custom API to register permanent custom devices"
  replyPosts: [{ body: "Don't use that endpoint — custom devices created via v1 expire after
    72 hours. Use the Metric Ingestion API with dimensions instead." }]
  Verdict: keep — the reply steers away from a broken approach and toward the correct one.
  Saves anyone who finds this thread from going down the same dead-end path.

KEEP — fixed in version (confidence 0.80):
  Subject: "EC2 instance ID appearing as host.name in logs instead of hostname"
  replyPosts: [{ body: "This was a bug fixed in OneAgent 1.299. Upgrade to resolve it." }]
  Verdict: keep — version-pinned resolution tells users exactly when the fix shipped and
  whether they need to upgrade. Still useful for anyone on an older agent version.

REVIEW (confidence 0.55):
  Subject: "Official DT recommendations for deploying via Flux or ArgoCD"
  replyPosts: [{ body: "I'd also like to know this." }]
  Verdict: review — the post body is a question with no accepted answer; the only reply is a
  "me too". Unclear whether the described deployment pattern is still valid.
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
