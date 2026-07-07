const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseCsv, isOriginalThread, normalizeRow } = require('../lib/csv-parser');
const { createSession } = require('../lib/session-store');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = express.Router();

const handleUpload = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Field name must be "csv".' });
  }
  const includeReplies = req.body && req.body.includeReplies === 'true';
  try {
    const { rows, errors } = parseCsv(req.file.path);

    // Always capture reply content as context for LLM review, regardless of includeReplies flag.
    // Maps parentUrl → array of {url, author, postedAt, subject, body} for each reply.
    // url is included so getAllReplies can recurse into nested replies (replies-to-replies).
    const replyMap = {};
    rows.forEach((row) => {
      if (isOriginalThread(row)) return;
      const n = normalizeRow(row);
      if (!replyMap[n.parentUrl]) replyMap[n.parentUrl] = [];
      replyMap[n.parentUrl].push({
        url: n.url,
        author: n.author,
        postedAt: n.postedAt ? n.postedAt.toISOString() : null,
        subject: n.subject,
        body: n.body,
      });
    });

    // BFS traversal so that reply order matches reading order in the thread.
    const getAllReplies = (rootUrl) => {
      const result = [];
      const queue = [rootUrl];
      const seen = new Set();
      while (queue.length) {
        const url = queue.shift();
        if (seen.has(url)) continue;
        seen.add(url);
        for (const reply of (replyMap[url] || [])) {
          result.push(reply);
          queue.push(reply.url);
        }
      }
      return result;
    };

    const filtered = includeReplies ? rows : rows.filter(isOriginalThread);
    const posts = filtered.map((row, idx) => {
      const n = normalizeRow(row);
      return {
        index: idx,
        subject: n.subject,
        body: n.body,
        url: n.url,
        author: n.author,
        postedAt: n.postedAt ? n.postedAt.toISOString() : null,
        postedAtRaw: n.postedAtRaw,
        replies: n.replies,
        kudos: n.kudos,
        parentUrl: n.parentUrl,
        rootUrl: n.rootUrl,
        // Reply bodies attached for LLM context; empty for reply rows themselves
        replyPosts: isOriginalThread(row) ? getAllReplies(n.url) : [],
        stars: null,
        rawScore: null,
        reasons: [],
        keywords: [],
        docOverlapMatched: null,
        docOverlapMatchedTerms: [],
        docLatestMatchAt: null,
        docLatestMatchUrl: null,
        docLatestMatchSource: null,
        docMatchedDocsPages: 0,
        docMatchedBlogPages: 0,
        docOverlapVerdict: null,
        checked: false,
        archived: false,
        analyzed: false,
      };
    });
    const session = createSession({
      sourceFile: req.file.originalname,
      posts,
    });
    fs.unlink(req.file.path, () => {});
    res.json({
      sessionId: session.id,
      totalRows: rows.length,
      includedRows: filtered.length,
      includeReplies,
      parseErrors: errors.slice(0, 5),
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: err.message });
  }
};

router.post('/', upload.single('csv'), handleUpload);

module.exports = router;
