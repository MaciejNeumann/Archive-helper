const { findDeprecatedMentions } = require('./deprecated-terms');
const { tokenize } = require('./keyword-extract');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const THREE_YEARS_MS = 3 * ONE_YEAR_MS;
const RECENT_DOC_WINDOW_MS = ONE_YEAR_MS;

const SCORING = {
  ACTIVE_MIN_KEYWORDS: 5,
  STALE_MAX_KEYWORDS: 3,
  ACTIVE_DISCUSSION_REPLIES: 5,
  COMMUNITY_ENDORSED_KUDOS: 1,
};

const scoreToStars = (score) => {
  const clamped = Math.max(0, score);
  if (clamped <= 1) return 1;
  if (clamped === 2) return 2;
  if (clamped === 3) return 3;
  if (clamped === 4) return 4;
  return 5;
};

const pageSourceFromUrl = (url) => (url && url.includes('/news/blog/') ? 'blog' : 'docs');

const RELEASE_NOTES_PATTERNS = [
  /\/whats-new(\/|-)/i,
  /release-notes/i,
  /\/sprint-\d+(\/|$)/i,
  /version-\d+-\d+/i,
  /\bchangelog\b/i,
];

const isReleaseNotesPage = (url) => {
  if (!url) return false;
  return RELEASE_NOTES_PATTERNS.some((re) => re.test(url));
};

const computeOverlap = (keywords, docsTokenSet) => {
  if (keywords.length === 0) return { matched: 0, matchedTerms: [] };
  const matchedTerms = keywords.filter((k) => docsTokenSet.has(k));
  return { matched: matchedTerms.length, matchedTerms };
};

const summarizeMatchedPages = (matchedTerms, docsIndex, pages) => {
  let overallLatestMs = null;
  let overallLatestPage = null;
  let substantiveLatestMs = null;
  let substantiveLatestPage = null;
  let latestDocsMs = null;
  let docsCount = 0;
  let blogCount = 0;
  const seenPages = new Set();
  for (const term of matchedTerms) {
    const pageIdxs = docsIndex.get(term) || [];
    for (const idx of pageIdxs) {
      if (seenPages.has(idx)) continue;
      seenPages.add(idx);
      const page = pages[idx];
      if (!page || !page.lastModified) continue;
      const isBlog = pageSourceFromUrl(page.url) === 'blog';
      const isReleaseNotes = isReleaseNotesPage(page.url);
      if (isBlog) blogCount++; else docsCount++;
      if (overallLatestMs === null || page.lastModified > overallLatestMs) {
        overallLatestMs = page.lastModified;
        overallLatestPage = page;
      }
      if (!isReleaseNotes) {
        if (substantiveLatestMs === null || page.lastModified > substantiveLatestMs) {
          substantiveLatestMs = page.lastModified;
          substantiveLatestPage = page;
        }
        if (!isBlog && (latestDocsMs === null || page.lastModified > latestDocsMs)) {
          latestDocsMs = page.lastModified;
        }
      }
    }
  }
  // For display, prefer a substantive (non-release-notes) page so reviewers see a real
  // article. Fall back to the overall latest only if there's nothing else — that way
  // the source counts and "latest" line never contradict each other.
  return {
    latestMs: substantiveLatestMs ?? overallLatestMs,
    latestPage: substantiveLatestPage ?? overallLatestPage,
    latestDocsMs,
    docsCount,
    blogCount,
  };
};

const buildDocsTokenSet = (pages) => {
  const set = new Set();
  for (const page of pages) {
    for (const t of tokenize(page.text)) set.add(t);
  }
  return set;
};

const scorePost = ({ post, keywords, docsTokenSet, docsIndex, pages, now = Date.now() }) => {
  const reasons = [];
  let score = 0;

  const postedAt = post.postedAt ? post.postedAt.getTime() : null;
  const ageMs = postedAt ? now - postedAt : null;
  const ageYears = ageMs ? ageMs / ONE_YEAR_MS : null;

  if (ageMs !== null && ageMs > THREE_YEARS_MS) {
    score += 2;
    reasons.push(`Posted ${ageYears.toFixed(1)} years ago (>3y threshold)`);
  }
  if (ageMs !== null && ageMs > ONE_YEAR_MS && post.replies === 0) {
    score += 1;
    reasons.push('No comments in over a year');
  }
  if (ageMs !== null && ageMs > ONE_YEAR_MS && post.kudos === 0) {
    score += 1;
    reasons.push('No kudos in over a year');
  }
  if (post.replies >= SCORING.ACTIVE_DISCUSSION_REPLIES) {
    score -= 1;
    reasons.push(`Active discussion (${post.replies} replies)`);
  }
  if (post.kudos >= SCORING.COMMUNITY_ENDORSED_KUDOS) {
    score -= 1;
    reasons.push(`Community-endorsed (${post.kudos} kudo${post.kudos === 1 ? '' : 's'})`);
  }

  const deprecated = findDeprecatedMentions(`${post.subject}\n${post.body}`);
  if (deprecated.length > 0) {
    score += 2;
    reasons.push(`Mentions deprecated: ${deprecated.join(', ')}`);
  }

  const overlap = computeOverlap(keywords, docsTokenSet);
  const { latestMs, latestPage, latestDocsMs, docsCount, blogCount } = overlap.matchedTerms.length > 0
    ? summarizeMatchedPages(overlap.matchedTerms, docsIndex, pages)
    : { latestMs: null, latestPage: null, latestDocsMs: null, docsCount: 0, blogCount: 0 };
  const hasFreshDocs = latestDocsMs && (now - latestDocsMs < RECENT_DOC_WINDOW_MS);
  let overlapVerdict = 'neutral';
  if (keywords.length === 0) {
    score += 1;
    reasons.push('Topic not found in current Docs or Blog');
    overlapVerdict = 'stale';
  } else if (keywords.length < SCORING.STALE_MAX_KEYWORDS) {
    score += 1;
    reasons.push('Few topic words match current Docs or Blog');
    overlapVerdict = 'stale';
  } else if (keywords.length >= SCORING.ACTIVE_MIN_KEYWORDS && hasFreshDocs) {
    overlapVerdict = 'active';
    if (ageMs !== null && ageMs < ONE_YEAR_MS) {
      score -= 1;
      reasons.push('Recent post on actively documented topic');
    }
  }

  return {
    rawScore: score,
    stars: scoreToStars(score),
    reasons,
    keywords,
    docOverlapMatched: overlap.matched,
    docOverlapMatchedTerms: overlap.matchedTerms,
    docLatestMatchAt: latestMs ? new Date(latestMs).toISOString() : null,
    docLatestMatchUrl: latestPage ? latestPage.url : null,
    docLatestMatchSource: latestPage ? pageSourceFromUrl(latestPage.url) : null,
    docMatchedDocsPages: docsCount,
    docMatchedBlogPages: blogCount,
    docOverlapVerdict: overlapVerdict,
  };
};

module.exports = { scorePost, buildDocsTokenSet, scoreToStars };
