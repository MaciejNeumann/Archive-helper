const express = require('express');
const {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
  deleteAllSessions,
  mergeLlmResults,
  isValidSessionId,
} = require('../lib/session-store');

const router = express.Router();

const requireValidId = (req, res, next) => {
  if (!isValidSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  next();
};

router.get('/', (req, res) => {
  res.json({ sessions: listSessions() });
});

router.delete('/', (req, res) => {
  const deleted = deleteAllSessions();
  res.json({ deleted });
});

router.get('/:id', requireValidId, (req, res) => {
  const data = loadSession(req.params.id);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  res.json(data);
});

router.post('/:id/save', requireValidId, async (req, res) => {
  const data = loadSession(req.params.id);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  try {
    const saved = await saveSession(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Overlay LLM-review results (from the analyze-post-context skill) onto a session.
router.post('/:id/llm-import', requireValidId, async (req, res) => {
  const results = Array.isArray(req.body) ? req.body : req.body && req.body.results;
  if (!Array.isArray(results)) {
    return res.status(400).json({ error: 'Expected a JSON array of results or { results: [...] }' });
  }
  const valid = results.filter((r) => r && Number.isInteger(r.index));
  if (valid.length === 0) {
    return res.status(400).json({ error: 'No results with a valid integer "index" field' });
  }
  try {
    const outcome = await mergeLlmResults(req.params.id, valid);
    if (!outcome) return res.status(404).json({ error: 'Session not found' });
    res.json(outcome);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireValidId, (req, res) => {
  const ok = deleteSession(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Session not found' });
  res.json({ deleted: true });
});

module.exports = router;
