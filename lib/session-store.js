const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidSessionId = (id) => typeof id === 'string' && UUID_RE.test(id);

const ensureDir = () => {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
};

const sessionPath = (id) => {
  if (!isValidSessionId(id)) throw new Error(`Invalid session id: ${id}`);
  return path.join(SESSIONS_DIR, `${id}.json`);
};

const writeSessionSync = (data) => {
  ensureDir();
  const stamped = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(sessionPath(data.id), JSON.stringify(stamped, null, 2));
  return stamped;
};

// Per-session write serialization: prevents lost updates when multiple
// concurrent requests (e.g. rapid checkbox toggles) try to load+mutate+save
// the same session file simultaneously.
const sessionTails = new Map();

const runSerialized = (id, fn) => {
  const prev = sessionTails.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  sessionTails.set(id, next.catch(() => {}));
  return next;
};

const createSession = ({ sourceFile, posts }) => {
  ensureDir();
  const id = uuid();
  const data = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceFile,
    docsCacheVersion: null,
    posts,
  };
  fs.writeFileSync(sessionPath(id), JSON.stringify(data, null, 2));
  return data;
};

const saveSession = (data) => runSerialized(data.id, () => writeSessionSync(data));

const loadSession = (id) => {
  if (!isValidSessionId(id)) return null;
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const listSessions = () => {
  ensureDir();
  return fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
        return {
          id: data.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          sourceFile: data.sourceFile,
          name: data.name || '',
          postCount: Array.isArray(data.posts) ? data.posts.length : 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
};

const deleteSession = (id) => {
  if (!isValidSessionId(id)) return false;
  const p = sessionPath(id);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    sessionTails.delete(id);
    return true;
  }
  return false;
};

const deleteAllSessions = () => {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  let deleted = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(SESSIONS_DIR, f));
      deleted++;
    } catch {}
  }
  sessionTails.clear();
  return deleted;
};

const updateCheckedFlag = (id, postIndex, checked) =>
  runSerialized(id, () => {
    const data = loadSession(id);
    if (!data) return null;
    if (postIndex < 0 || postIndex >= data.posts.length) return null;
    data.posts[postIndex].checked = !!checked;
    return writeSessionSync(data);
  });

const updateArchivedFlag = (id, postIndex, archived) =>
  runSerialized(id, () => {
    const data = loadSession(id);
    if (!data) return null;
    if (postIndex < 0 || postIndex >= data.posts.length) return null;
    data.posts[postIndex].archived = !!archived;
    return writeSessionSync(data);
  });

const updateSessionName = (id, name) =>
  runSerialized(id, () => {
    const data = loadSession(id);
    if (!data) return null;
    data.name = typeof name === 'string' ? name.trim() : '';
    return writeSessionSync(data);
  });

const LLM_VERDICTS = new Set(['archive', 'keep', 'review', 'review:stale', 'review:uncertain']);

const normalizeLlmResult = (r) => {
  // Detect 0–100 integer scale (e.g. 85 instead of 0.85) and convert to 0–1 before clamping
  const rawConf = typeof r.llmConfidence === 'number'
    ? (r.llmConfidence > 1 ? r.llmConfidence / 100 : r.llmConfidence)
    : null;
  const verdict = LLM_VERDICTS.has(r.llmVerdict) ? r.llmVerdict : 'review';
  return {
    llmVerdict: verdict,
    llmConfidence: rawConf !== null ? Math.max(0, Math.min(1, rawConf)) : null,
    llmSummary: typeof r.llmSummary === 'string' ? r.llmSummary : '',
    llmReasoning: typeof r.llmReasoning === 'string' ? r.llmReasoning : '',
    llmStaleType: verdict === 'review:stale' && typeof r.llmStaleType === 'string' ? r.llmStaleType : null,
    llmAnalyzedAt: new Date().toISOString(),
  };
};

// Overlays LLM-review results (produced by the analyze-post-context skill) onto an
// existing session, matching each result to its post by `index`. Returns the count
// of posts updated and skipped so the caller can report it.
const mergeLlmResults = (id, results) =>
  runSerialized(id, () => {
    const data = loadSession(id);
    if (!data) return null;
    const byIndex = new Map(data.posts.map((p) => [p.index, p]));
    let matched = 0;
    let skipped = 0;
    let coerced = 0;
    for (const r of results) {
      const post = byIndex.get(r.index);
      if (!post) { skipped++; continue; }
      if (!LLM_VERDICTS.has(r.llmVerdict)) coerced++;
      Object.assign(post, normalizeLlmResult(r));
      matched++;
    }
    writeSessionSync(data);
    return { matched, skipped, coerced };
  });

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  deleteAllSessions,
  updateCheckedFlag,
  updateArchivedFlag,
  updateSessionName,
  mergeLlmResults,
  isValidSessionId,
  SESSIONS_DIR,
};
