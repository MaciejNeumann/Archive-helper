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

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  deleteAllSessions,
  updateCheckedFlag,
  isValidSessionId,
  SESSIONS_DIR,
};
