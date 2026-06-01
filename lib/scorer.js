const { findDeprecatedMentions } = require('./deprecated-terms');
const { tokenize } = require('./keyword-extract');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const THREE_YEARS_MS = 3 * ONE_YEAR_MS;
const RECENT_DOC_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

const scoreToStars = (score) => {
  const clamped = Math.max(0, score);
  if (clamped <= 1) return 1;
  if (clamped === 2) return 2;
  if (clamped === 3) return 3;
  if (clamped === 4) return 4;
  return 5;
};

const computeOverlap = (keywords, docsTokenSet) => {
  if (keywords.length === 0) return { matched: 0, ratio: 0, matchedTerms: [] };
  const matchedTerms = keywords.filter((k) => docsTokenSet.has(k));
  return { matched: matchedTerms.length, ratio: matchedTerms.length / keywords.length, matchedTerms };
};

const mostRecentMatchDate = (matchedTerms, docsIndex, pages) => {
  let latest = null;
  const seenPages = new Set();
  for (const term of matchedTerms) {
    const pageIdxs = docsIndex.get(term) || [];
    for (const idx of pageIdxs) {
      if (seenPages.has(idx)) continue;
      seenPages.add(idx);
      const page = pages[idx];
      if (page && page.lastModified) {
        if (latest === null || page.lastModified > latest) latest = page.lastModified;
      }
    }
  }
  return latest;
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

  const deprecated = findDeprecatedMentions(`${post.subject}\n${post.body}`);
  if (deprecated.length > 0) {
    score += 2;
    reasons.push(`Mentions deprecated: ${deprecated.join(', ')}`);
  }

  const overlap = computeOverlap(keywords, docsTokenSet);
  const latestMatchMs = overlap.matchedTerms.length > 0
    ? mostRecentMatchDate(overlap.matchedTerms, docsIndex, pages)
    : null;
  let overlapVerdict = 'neutral';
  if (keywords.length > 0) {
    if (overlap.ratio < 0.2) {
      score += 1;
      reasons.push('Topic not found in current Docs/Blog');
      overlapVerdict = 'stale';
    } else if (overlap.ratio >= 0.6 && latestMatchMs && now - latestMatchMs < RECENT_DOC_WINDOW_MS) {
      score -= 1;
      reasons.push('Topic actively documented');
      overlapVerdict = 'active';
    }
  }

  return {
    rawScore: score,
    stars: scoreToStars(score),
    reasons,
    keywords,
    docOverlapRatio: Number(overlap.ratio.toFixed(2)),
    docOverlapMatched: overlap.matched,
    docOverlapTotal: keywords.length,
    docOverlapMatchedTerms: overlap.matchedTerms,
    docLatestMatchAt: latestMatchMs ? new Date(latestMatchMs).toISOString() : null,
    docOverlapVerdict: overlapVerdict,
  };
};

module.exports = { scorePost, buildDocsTokenSet, scoreToStars };
