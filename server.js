const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;

['cache', 'sessions', 'uploads'].forEach((d) => {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));

app.use('/api/upload', require('./routes/upload'));
app.use('/api/analyze', require('./routes/analyze'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/sessions', require('./routes/checked'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`Archive helper running at http://localhost:${PORT}`);
});
