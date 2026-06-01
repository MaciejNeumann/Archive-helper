const express = require('express');
const { updateCheckedFlag, isValidSessionId } = require('../lib/session-store');

const router = express.Router();

router.patch('/:id/checked', async (req, res) => {
  if (!isValidSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  const { postIndex, checked } = req.body || {};
  if (typeof postIndex !== 'number') {
    return res.status(400).json({ error: 'postIndex (number) required' });
  }
  try {
    const result = await updateCheckedFlag(req.params.id, postIndex, !!checked);
    if (!result) return res.status(404).json({ error: 'Session or post not found' });
    res.json({ ok: true, postIndex, checked: !!checked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
