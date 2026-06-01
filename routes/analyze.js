const express = require('express');
const { loadSession, saveSession, isValidSessionId } = require('../lib/session-store');
const { ensureDocsCache, buildKeywordIndex } = require('../lib/docs-crawler');
const { extractKeywordsForPosts, tokenize } = require('../lib/keyword-extract');
const { scorePost, buildDocsTokenSet } = require('../lib/scorer');

const router = express.Router();

const sseHeaders = (res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
};

const sendEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const handleAnalyze = async (req, res) => {
  if (!isValidSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  const session = loadSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const force = req.query.refreshCache === 'true';
  sseHeaders(res);

  let clientClosed = false;
  req.on('close', () => { clientClosed = true; });

  try {
    sendEvent(res, 'phase', { phase: 'docs', message: 'Loading Docs/Blog cache…' });
    const cache = await ensureDocsCache({
      force,
      onProgress: (p) => sendEvent(res, 'docs', p),
    });
    if (clientClosed) return;

    sendEvent(res, 'phase', { phase: 'index', message: 'Building keyword index…' });
    const docsTokenSet = buildDocsTokenSet(cache.pages);
    const docsIndex = buildKeywordIndex(cache.pages, tokenize);

    sendEvent(res, 'phase', { phase: 'keywords', message: 'Extracting post keywords (constrained to Dynatrace Docs/Blog vocabulary)…' });
    const keywordsByPost = extractKeywordsForPosts(session.posts, 25, { vocab: docsTokenSet });

    sendEvent(res, 'phase', { phase: 'scoring', message: 'Scoring posts…', total: session.posts.length });

    const now = Date.now();
    for (let i = 0; i < session.posts.length; i++) {
      if (clientClosed) return;
      const post = session.posts[i];
      const postedAtObj = post.postedAt ? { ...post, postedAt: new Date(post.postedAt) } : post;
      const result = scorePost({
        post: postedAtObj,
        keywords: keywordsByPost.get(post) || [],
        docsTokenSet,
        docsIndex,
        pages: cache.pages,
        now,
      });
      session.posts[i] = {
        ...post,
        ...result,
        analyzed: true,
      };
      if ((i + 1) % 25 === 0 || i === session.posts.length - 1) {
        sendEvent(res, 'progress', { done: i + 1, total: session.posts.length });
      }
    }

    session.docsCacheVersion = new Date(cache.fetchedAt).toISOString();
    await saveSession(session);

    const blogPagesCount = cache.pages.filter((p) => p.url && p.url.includes('/news/blog/')).length;
    const docsPagesCount = cache.pageCount - blogPagesCount;
    sendEvent(res, 'done', {
      sessionId: session.id,
      total: session.posts.length,
      docsPages: docsPagesCount,
      blogPages: blogPagesCount,
      totalSourcePages: cache.pageCount,
    });
    res.end();
  } catch (err) {
    sendEvent(res, 'error', { message: err.message });
    res.end();
  }
};

router.post('/:id', handleAnalyze);

module.exports = router;
