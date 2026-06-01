const express = require('express');
const {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
  deleteAllSessions,
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

router.delete('/:id', requireValidId, (req, res) => {
  const ok = deleteSession(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Session not found' });
  res.json({ deleted: true });
});

module.exports = router;
