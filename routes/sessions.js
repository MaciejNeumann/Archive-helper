const express = require('express');
const {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
} = require('../lib/session-store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ sessions: listSessions() });
});

router.get('/:id', (req, res) => {
  const data = loadSession(req.params.id);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  res.json(data);
});

router.post('/:id/save', (req, res) => {
  const data = loadSession(req.params.id);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  res.json(saveSession(data));
});

router.delete('/:id', (req, res) => {
  const ok = deleteSession(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Session not found' });
  res.json({ deleted: true });
});

module.exports = router;
