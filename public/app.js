// ------------------------- State -------------------------
const state = {
  sessionId: null,
  posts: [],
  sort: { key: 'stars', dir: 'desc' },
  filter: { text: '', minStars: 0 },
  analyzing: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ------------------------- Toast -------------------------
const showToast = (msg, isError = false) => {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 3000);
};

// ------------------------- Star render -------------------------
const renderStars = (n) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(`<span class="star${i <= n ? ' filled' : ''}"></span>`);
  }
  return `<span class="stars" title="${n} star${n === 1 ? '' : 's'}">${stars.join('')}</span>`;
};

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const shorten = (text, n) => {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};

// ------------------------- Upload flow -------------------------
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const handleFileChosen = (file) => {
  if (!file) return;
  $('#dropFilename').textContent = file.name;
  $('#dropFilesize').textContent = formatFileSize(file.size);
  $('#dropZone').classList.add('selected');
  $('.drop-empty').hidden = true;
  $('.drop-selected').hidden = false;
  $('#uploadBtn').disabled = false;
  showToast(`Selected ${file.name}`);
};

const handleFileCleared = () => {
  $('#csvFile').value = '';
  $('#dropZone').classList.remove('selected');
  $('.drop-empty').hidden = false;
  $('.drop-selected').hidden = true;
  $('#uploadBtn').disabled = true;
  $('#uploadBtn').textContent = 'Upload & parse';
};

const setupDropZone = () => {
  const zone = $('#dropZone');
  const input = $('#csvFile');
  zone.addEventListener('click', (e) => {
    if (e.target.closest('#dropRemove')) return;
    if (e.target.tagName !== 'INPUT') input.click();
  });
  input.addEventListener('change', () => handleFileChosen(input.files[0]));
  $('#dropRemove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileCleared();
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.remove('dragover');
  }));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      input.files = e.dataTransfer.files;
      handleFileChosen(file);
    }
  });
};

const handleUploadSubmit = async (e) => {
  e.preventDefault();
  const file = $('#csvFile').files[0];
  if (!file) return;
  const includeReplies = $('#includeReplies').checked;
  const fd = new FormData();
  fd.append('csv', file);
  fd.append('includeReplies', String(includeReplies));
  $('#uploadBtn').disabled = true;
  $('#uploadBtn').textContent = 'Uploading…';
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Upload failed');
    showToast(`Parsed ${data.includedRows} of ${data.totalRows} rows`);
    state.sessionId = data.sessionId;
    await startAnalysis(false);
  } catch (err) {
    showToast(err.message, true);
    $('#uploadBtn').textContent = 'Upload & parse';
    $('#uploadBtn').disabled = false;
  }
};

// ------------------------- Analyze (SSE) -------------------------
const startAnalysis = async (refreshCache) => {
  if (!state.sessionId) return;
  state.analyzing = true;
  $('#uploadSection').hidden = true;
  $('#progressSection').hidden = false;
  $('#progressTitle').textContent = 'Analyzing…';
  $('#progressDetail').textContent = 'Starting…';
  $('#progressBar').style.width = '5%';
  $('#phaseLog').innerHTML = '';

  const logPhase = (msg) => {
    const li = document.createElement('li');
    li.textContent = msg;
    $('#phaseLog').appendChild(li);
  };

  const url = `/api/analyze/${state.sessionId}${refreshCache ? '?refreshCache=true' : ''}`;

  // SSE over POST: use fetch + ReadableStream parsing
  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok || !res.body) throw new Error(`Analyze failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\n\n/);
      buffer = events.pop();
      for (const ev of events) {
        const lines = ev.split('\n');
        let event = 'message', data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        try {
          const payload = JSON.parse(data);
          await handleSseEvent(event, payload, logPhase);
        } catch {}
      }
    }
  } catch (err) {
    showToast(err.message, true);
  } finally {
    state.analyzing = false;
  }
};

const handleSseEvent = async (event, payload, logPhase) => {
  if (event === 'phase') {
    logPhase(payload.message);
    $('#progressDetail').textContent = payload.message;
  } else if (event === 'docs') {
    if (payload.total > 0) {
      const pct = Math.min(40, Math.round((payload.done / payload.total) * 40));
      $('#progressBar').style.width = `${5 + pct}%`;
      $('#progressDetail').textContent = `Crawling docs.dynatrace.com + Dynatrace Blog · ${payload.done}/${payload.total}`;
    }
  } else if (event === 'progress') {
    const pct = 50 + Math.round((payload.done / payload.total) * 45);
    $('#progressBar').style.width = `${pct}%`;
    $('#progressDetail').textContent = `Scoring ${payload.done} / ${payload.total} posts`;
  } else if (event === 'done') {
    $('#progressBar').style.width = '100%';
    const docs = payload.docsPages ?? 0;
    const blog = payload.blogPages ?? 0;
    $('#progressDetail').textContent =
      `Done. ${payload.total} posts scored against ${docs} Docs pages + ${blog} Blog posts.`;
    await loadResults(payload.sessionId);
  } else if (event === 'error') {
    showToast(payload.message, true);
  }
};

// ------------------------- Results -------------------------
const loadResults = async (sessionId) => {
  const r = await fetch(`/api/sessions/${sessionId}`);
  if (!r.ok) {
    showToast('Failed to load results', true);
    return;
  }
  const data = await r.json();
  state.sessionId = data.id;
  state.posts = data.posts;
  $('#progressSection').hidden = true;
  $('#resultsSection').hidden = false;
  $('#newCsvBtn').hidden = false;
  $('#resultsTitle').textContent = `Results · ${data.sourceFile || ''}`;
  renderResults();
};

const filteredSortedPosts = () => {
  const { text, minStars } = state.filter;
  const needle = text.trim().toLowerCase();
  let rows = state.posts.filter((p) => p.analyzed);
  if (minStars > 0) rows = rows.filter((p) => p.stars >= minStars);
  if (needle) {
    rows = rows.filter((p) => {
      const blob = `${p.subject} ${p.author} ${(p.keywords || []).join(' ')}`.toLowerCase();
      return blob.includes(needle);
    });
  }
  const { key, dir } = state.sort;
  const mul = dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'stars') { av = a.rawScore ?? 0; bv = b.rawScore ?? 0; }
    if (key === 'postedAt') { av = av || ''; bv = bv || ''; }
    if (typeof av === 'string') return av.localeCompare(bv || '') * mul;
    return ((av || 0) - (bv || 0)) * mul;
  });
  return rows;
};

const renderNumCell = (value) => {
  const n = Number(value ?? 0);
  const cls = n === 0 ? 'big zero' : 'big';
  return `<span class="num-cell"><span class="${cls}">${n}</span></span>`;
};

const overlapVerdictLabel = (verdict) => {
  if (verdict === 'active') return 'Active in docs';
  if (verdict === 'stale') return 'Missing from docs';
  return 'Partial match';
};

const sourceLabel = (src) => (src === 'blog' ? 'Blog' : 'Docs');

const renderSourceCounts = (docsCount, blogCount) => {
  if (!docsCount && !blogCount) return '';
  const parts = [];
  parts.push(`<span class="source-chip source-docs" title="Matches on docs.dynatrace.com">📘 ${docsCount} Docs</span>`);
  parts.push(`<span class="source-chip source-blog" title="Matches on the Dynatrace Blog">📰 ${blogCount} Blog</span>`);
  return `<div class="overlap-sources">${parts.join('')}</div>`;
};

const ALLOWED_SOURCES = new Set(['docs', 'blog']);

const renderLatestMatch = (post) => {
  if (!post.docLatestMatchAt) return '<div class="overlap-meta">No matches in Docs or Blog</div>';
  const src = ALLOWED_SOURCES.has(post.docLatestMatchSource) ? post.docLatestMatchSource : 'docs';
  const label = sourceLabel(src);
  const date = formatDate(post.docLatestMatchAt);
  if (post.docLatestMatchUrl) {
    return `<div class="overlap-meta">
      Latest <a class="source-link source-${src}" href="${escapeHtml(post.docLatestMatchUrl)}" target="_blank" rel="noopener" title="${escapeHtml(post.docLatestMatchUrl)}">${label}</a> page · ${date}
    </div>`;
  }
  return `<div class="overlap-meta">Latest ${label} page · ${date}</div>`;
};

const KEYWORD_CAP = 25;

const renderOverlapCell = (post) => {
  const matched = post.docOverlapMatched ?? 0;
  const verdict = post.docOverlapVerdict || 'neutral';
  const densityPct = Math.min(100, Math.round((matched / KEYWORD_CAP) * 100));
  const matchedTerms = (post.docOverlapMatchedTerms || []).slice(0, 3);
  const sampleTerms = matchedTerms.length
    ? `e.g. ${matchedTerms.map(escapeHtml).join(', ')}${matched > matchedTerms.length ? '…' : ''}`
    : 'No IT-vocab terms in this post';
  const docsCount = post.docMatchedDocsPages ?? 0;
  const blogCount = post.docMatchedBlogPages ?? 0;
  const countLabel = matched === 0
    ? '<strong>0</strong> Docs/Blog keywords'
    : `<strong>${matched}</strong> ${matched === 1 ? 'keyword' : 'keywords'} match Docs/Blog`;
  return `
    <div class="overlap-cell">
      <div>
        <span class="overlap-tag verdict-${verdict}">${overlapVerdictLabel(verdict)}</span>
      </div>
      <div class="overlap-bar" title="Density of Docs/Blog vocabulary in this post (out of ${KEYWORD_CAP} top keyword slots)">
        <span class="verdict-${verdict}" style="width:${densityPct}%"></span>
      </div>
      <div class="overlap-meta">${countLabel}</div>
      ${renderSourceCounts(docsCount, blogCount)}
      <div class="overlap-meta">${sampleTerms}</div>
      ${renderLatestMatch(post)}
    </div>
  `;
};

const renderResults = () => {
  const rows = filteredSortedPosts();
  const totalChecked = state.posts.filter((p) => p.checked).length;
  $('#resultsSummary').textContent =
    `${rows.length} shown · ${state.posts.length} total · ${totalChecked} checked`;

  const tbody = $('#resultsTbody');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const post of rows) {
    const tr = document.createElement('tr');
    if (post.checked) tr.classList.add('checked');
    tr.dataset.idx = post.index;

    const reasons = (post.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    const kwScores = post.keywordScores || {};
    const keywords = (post.keywords || []).slice(0, 8)
      .map((k) => {
        const s = kwScores[k];
        const badge = s != null ? `<span class="kw-score">${s}</span>` : '';
        return `<span class="kw-chip">${escapeHtml(k)}${badge}</span>`;
      }).join('');

    tr.innerHTML = `
      <td class="col-checked">
        <input type="checkbox" class="checked-box" ${post.checked ? 'checked' : ''} data-idx="${post.index}" />
      </td>
      <td class="col-stars">
        <div class="score-cell">
          ${renderStars(post.stars || 1)}
          <span class="raw">raw score ${post.rawScore ?? 0}</span>
        </div>
      </td>
      <td class="col-subject">
        <a class="post-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">
          ${escapeHtml(post.subject || '(no subject)')}
        </a>
        <div class="post-snippet">${escapeHtml(shorten(post.body, 160))}</div>
        ${keywords ? `<div class="post-keywords">${keywords}</div>` : ''}
      </td>
      <td class="col-author">${escapeHtml(post.author || '—')}</td>
      <td class="col-date">${formatDate(post.postedAt)}</td>
      <td class="col-num">${renderNumCell(post.replies)}</td>
      <td class="col-num">${renderNumCell(post.kudos)}</td>
      <td class="col-overlap">${renderOverlapCell(post)}</td>
      <td class="col-why">
        ${reasons ? `<ul class="why-list">${reasons}</ul>` : '<span class="muted">No archive signals.</span>'}
      </td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  highlightSort();
};

const highlightSort = () => {
  $$('.sortable').forEach((th) => {
    th.classList.toggle('active', th.dataset.sort === state.sort.key);
    th.textContent = th.textContent.replace(/[▲▼]\s*$/, '').trim();
    if (th.dataset.sort === state.sort.key) {
      th.textContent = `${th.textContent} ${state.sort.dir === 'desc' ? '▼' : '▲'}`;
    }
  });
};

const handleSortClick = (e) => {
  const th = e.target.closest('.sortable');
  if (!th) return;
  const key = th.dataset.sort;
  if (state.sort.key === key) state.sort.dir = state.sort.dir === 'desc' ? 'asc' : 'desc';
  else {
    state.sort.key = key;
    const ascByDefault = key === 'subject' || key === 'author' || key === 'docOverlapMatched';
    state.sort.dir = ascByDefault ? 'asc' : 'desc';
  }
  renderResults();
};

const handleCheckboxToggle = async (e) => {
  const cb = e.target;
  if (!cb.classList.contains('checked-box')) return;
  const idx = parseInt(cb.dataset.idx, 10);
  const checked = cb.checked;
  const post = state.posts.find((p) => p.index === idx);
  if (post) post.checked = checked;
  cb.closest('tr').classList.toggle('checked', checked);
  try {
    const r = await fetch(`/api/sessions/${state.sessionId}/checked`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIndex: idx, checked }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
  } catch (err) {
    showToast(err.message, true);
  }
};

const handleSearch = () => {
  state.filter.text = $('#searchBox').value;
  renderResults();
};
const handleStarFilter = () => {
  state.filter.minStars = parseInt($('#starFilter').value, 10) || 0;
  renderResults();
};

// ------------------------- Sessions -------------------------
const openSessionsDialog = async () => {
  const r = await fetch('/api/sessions');
  const { sessions } = await r.json();
  const ul = $('#sessionsList');
  ul.innerHTML = '';
  if (sessions.length === 0) {
    ul.innerHTML = '<li class="muted">No saved sessions yet.</li>';
  }
  for (const s of sessions) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="session-meta">
        <span class="name">${escapeHtml(s.sourceFile || s.id)}</span>
        <span class="sub">${s.postCount} posts · saved ${new Date(s.updatedAt).toLocaleString()}</span>
      </div>
      <div class="session-actions">
        <button class="ghost-btn" data-action="load" data-id="${s.id}">Load</button>
        <button class="ghost-btn danger" data-action="delete" data-id="${s.id}">Delete</button>
      </div>
    `;
    ul.appendChild(li);
  }
  $('#clearAllSessionsBtn').hidden = sessions.length === 0;
  $('#sessionsDialog').showModal();
};

const handleClearAllSessions = async () => {
  if (!confirm('Delete ALL saved sessions? This cannot be undone.')) return;
  const r = await fetch('/api/sessions', { method: 'DELETE' });
  if (r.ok) {
    const { deleted } = await r.json();
    showToast(`Cleared ${deleted} session${deleted === 1 ? '' : 's'}`);
    openSessionsDialog();
  } else {
    showToast('Failed to clear sessions', true);
  }
};

const handleSessionsClick = async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'load') {
    $('#sessionsDialog').close();
    await loadResults(id);
    $('#uploadSection').hidden = true;
    $('#progressSection').hidden = true;
  } else if (action === 'delete') {
    if (!confirm('Delete this session?')) return;
    const r = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (r.ok) {
      showToast('Session deleted');
      openSessionsDialog();
    }
  }
};

const handleSaveSession = async () => {
  if (!state.sessionId) return;
  const r = await fetch(`/api/sessions/${state.sessionId}/save`, { method: 'POST' });
  if (r.ok) showToast('Session saved'); else showToast('Save failed', true);
};

const handleNewCsv = () => {
  handleFileCleared();
  $('#resultsSection').hidden = true;
  $('#progressSection').hidden = true;
  $('#uploadSection').hidden = false;
  $('#newCsvBtn').hidden = true;
};

const handleRefreshCache = async () => {
  if (!state.sessionId) {
    showToast('Upload a CSV first, then refresh.', true);
    return;
  }
  if (!confirm('Re-crawl Dynatrace Docs and Blog? This can take a few minutes.')) return;
  await startAnalysis(true);
};

// ------------------------- Init -------------------------
const init = () => {
  setupDropZone();
  $('#uploadForm').addEventListener('submit', handleUploadSubmit);
  $('#resultsTable thead').addEventListener('click', handleSortClick);
  $('#resultsTbody').addEventListener('change', handleCheckboxToggle);
  $('#searchBox').addEventListener('input', handleSearch);
  $('#starFilter').addEventListener('change', handleStarFilter);
  $('#newCsvBtn').addEventListener('click', handleNewCsv);
  $('#loadSessionBtn').addEventListener('click', openSessionsDialog);
  $('#sessionsList').addEventListener('click', handleSessionsClick);
  $('#clearAllSessionsBtn').addEventListener('click', handleClearAllSessions);
  $('#saveSessionBtn').addEventListener('click', handleSaveSession);
  $('#refreshCacheBtn').addEventListener('click', handleRefreshCache);
};

init();
