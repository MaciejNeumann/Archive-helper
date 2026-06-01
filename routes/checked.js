const express = require('express');
const { updateCheckedFlag } = require('../lib/session-store');

const router = express.Router();

router.patch('/:id/checked', express.json(), (req, res) => {
  const { postIndex, checked } = req.body || {};
  if (typeof postIndex !== 'number') {
    return res.status(400).json({ error: 'postIndex (number) required' });
  }
  const result = updateCheckedFlag(req.params.id, postIndex, !!checked);
  if (!result) return res.status(404).json({ error: 'Session or post not found' });
  res.json({ ok: true, postIndex, checked: !!checked });
});

module.exports = router;
