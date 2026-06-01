const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

const ensureDir = () => {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
};

const sessionPath = (id) => path.join(SESSIONS_DIR, `${id}.json`);

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

const saveSession = (data) => {
  ensureDir();
  const stamped = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(sessionPath(data.id), JSON.stringify(stamped, null, 2));
  return stamped;
};

const loadSession = (id) => {
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
  const p = sessionPath(id);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
};

const updateCheckedFlag = (id, postIndex, checked) => {
  const data = loadSession(id);
  if (!data) return null;
  if (postIndex < 0 || postIndex >= data.posts.length) return null;
  data.posts[postIndex].checked = !!checked;
  return saveSession(data);
};

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  updateCheckedFlag,
  SESSIONS_DIR,
};
