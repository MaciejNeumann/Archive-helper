// ------------------------- State -------------------------
const state = {
  sessionId: null,
  sessionName: '',
  posts: [],
  sort: { key: 'stars', dir: 'desc' },
  filter: { text: '', minStars: 0, llmVerdict: '' },
  analyzing: false,
  tableMode: localStorage.getItem('dt-table-mode') || 'review',
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
  state.sessionName = data.name || '';
  state.posts = data.posts;
  state.sourceFile = data.sourceFile || '';

  if (data.viewState) {
    state.filter = { text: '', minStars: 0, llmVerdict: '', ...(data.viewState.filter || {}) };
    state.sort = { key: 'stars', dir: 'desc', ...(data.viewState.sort || {}) };
  } else {
    state.filter = { text: '', minStars: 0, llmVerdict: '' };
    state.sort = { key: 'stars', dir: 'desc' };
  }
  $('#searchBox').value = state.filter.text || '';
  $('#starFilter').value = String(state.filter.minStars || 0);
  $('#llmFilter').value = state.filter.llmVerdict || '';

  $('#progressSection').hidden = true;
  $('#resultsSection').hidden = false;
  $('#newCsvBtn').hidden = false;
  $('#topSaveBtn').hidden = false;
  $('#resultsTitle').textContent = `Results · ${data.sourceFile || ''}`;
  $('#sessionNameInput').value = state.sessionName;
  renderLlmCoverage(data.posts);
  renderResults();
};

const renderLlmCoverage = (posts) => {
  const analyzed = (posts || []).filter((p) => p.analyzed);
  const withVerdict = analyzed.filter((p) => p.llmVerdict);
  const el = $('#llmCoverage');
  if (withVerdict.length === 0) {
    el.hidden = true;
    return;
  }
  const pct = Math.round((withVerdict.length / analyzed.length) * 100);
  const disagreements = withVerdict.filter(llmDisagreesWithStars).length;
  const counts = withVerdict.reduce((a, p) => { a[p.llmVerdict] = (a[p.llmVerdict] || 0) + 1; return a; }, {});
  const reviewTotal = (counts['review'] || 0) + (counts['review:stale'] || 0) + (counts['review:uncertain'] || 0);
  const reviewDetail = [counts['review:stale'] && `${counts['review:stale']} stale`, counts['review:uncertain'] && `${counts['review:uncertain']} uncertain`].filter(Boolean).join(', ');
  const parts = [
    counts['archive'] && `${counts['archive']} archive`,
    counts['keep'] && `${counts['keep']} keep`,
    reviewTotal && `${reviewTotal} review${reviewDetail ? ` (${reviewDetail})` : ''}`,
  ].filter(Boolean);
  el.innerHTML = `LLM review: <strong>${withVerdict.length} / ${analyzed.length} posts</strong> (${pct}%) — ${parts.join(' · ')}${disagreements ? ` · <span class="llm-coverage-disagree">${disagreements} disagree with ★ score</span>` : ''}`;
  el.hidden = false;
};

const llmDisagreesWithStars = (p) => {
  if (!p.llmVerdict) return false;
  // 3★+ posts are archive candidates; LLM saying "keep" is a real disagreement worth surfacing
  if (p.llmVerdict === 'keep' && p.stars >= 3) return true;
  if (p.llmVerdict === 'archive' && p.stars <= 2) return true;
  return false;
};

const filteredSortedPosts = () => {
  const { text, minStars, llmVerdict } = state.filter;
  const needle = text.trim().toLowerCase();
  let rows = state.posts.filter((p) => p.analyzed);
  if (minStars > 0) rows = rows.filter((p) => p.stars >= minStars);
  if (llmVerdict === 'none') rows = rows.filter((p) => !p.llmVerdict);
  else if (llmVerdict === 'disagree') rows = rows.filter(llmDisagreesWithStars);
  else if (llmVerdict === 'review') rows = rows.filter((p) => p.llmVerdict === 'review' || p.llmVerdict === 'review:stale' || p.llmVerdict === 'review:uncertain');
  else if (llmVerdict.startsWith('stale:')) { const st = llmVerdict.slice(6); rows = rows.filter((p) => p.llmVerdict === 'review:stale' && p.llmStaleType === st); }
  else if (llmVerdict) rows = rows.filter((p) => p.llmVerdict === llmVerdict);
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

const LLM_VERDICT_LABEL = { archive: 'Archive', keep: 'Keep', review: 'Needs review', 'review:stale': 'Stale answer', 'review:uncertain': 'Uncertain' };
const STALE_TYPE_LABELS = { 'api-version': 'Old API', 'ui-path': 'Old UI path', 'coming-soon': 'Coming soon', 'not-possible': 'Not possible', 'pricing': 'Pricing/licensing', 'general': 'General staleness' };

const highlightLlmText = (() => {
  const phrases = [
    // archive signals
    ...['no longer supported', 'no longer available', 'no longer documented', 'no longer maintained',
        'no longer relevant', 'no longer valid', 'no longer in use', 'no longer exists',
        'not supported', 'not available', 'not documented',
        'end-of-life', 'end of life', 'end of support',
        'deprecated', 'deprecation', 'retired', 'retirement',
        'discontinued', 'obsolete', 'superseded', 'replaced by', 'phased out',
        'decommissioned', 'removed', 'sunset', 'sunsetted',
        'legacy', 'outdated', 'old version', 'older version',
        'appmon', 'ruxit', 'easytravel', 'cloud foundry', 'classic ui', 'pcf',
        'dynatrace 6', 'dynatrace 7',
    ].map(w => ({ w, cls: 'archive' })),
    // keep signals
    ...['actively supported', 'actively documented', 'actively maintained',
        'currently supported', 'currently documented',
        'still supported', 'still valid', 'still current', 'still useful',
        'still relevant', 'still applies', 'still accurate', 'still correct', 'still works',
        'working solution', 'concrete steps', 'recurring',
        'best practice', 'recommended approach', 'up to date', 'up-to-date',
        'well documented', 'well-documented', 'frequently asked', 'common question',
        'valuable resource', 'evergreen',
    ].map(w => ({ w, cls: 'keep' })),
    // stale signals
    ...['may be wrong', 'may mislead', 'may no longer', 'may have changed', 'may be outdated',
        'may not apply', 'may not be accurate',
        'might have changed', 'might be outdated',
        'could be outdated',
        'possibly outdated', 'likely outdated', 'probably outdated',
        'out of date', 'out-of-date',
        'no longer accurate', 'needs verification', 'needs updating',
        'worth verifying', 'should be verified', 'unclear if', 'uncertain whether',
    ].map(w => ({ w, cls: 'stale' })),
  ].sort((a, b) => b.w.length - a.w.length);

  const map = Object.fromEntries(phrases.map(({ w, cls }) => [w, cls]));
  const re = new RegExp(phrases.map(({ w }) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return (escaped) => escaped.replace(re, (m) => `<strong class="llm-hl-${map[m.toLowerCase()]}">${m}</strong>`);
})();

const renderLlmCell = (post) => {
  if (!post.llmVerdict) return '<span class="muted">—</span>';
  const verdict = post.llmVerdict;
  const cssVerdict = verdict.replace(':', '-');
  const label = LLM_VERDICT_LABEL[verdict] || verdict;
  const disagrees = llmDisagreesWithStars(post);
  const disagreeBadge = disagrees
    ? `<span class="llm-disagree-badge" title="LLM verdict disagrees with rule-based star score">⚡</span>`
    : '';
  const staleLabel = STALE_TYPE_LABELS[post.llmStaleType];
  const staleChip = verdict === 'review:stale' && staleLabel
    ? `<span class="llm-stale-chip llm-stale-${post.llmStaleType}">${staleLabel}</span>`
    : '';
  const pct = typeof post.llmConfidence === 'number' ? Math.round(post.llmConfidence * 100) : null;
  const confBar = pct !== null ? `
    <div class="llm-conf-row">
      <div class="llm-conf-bar"><span class="llm-conf-fill llm-${cssVerdict}" style="width:${pct}%"></span></div>
      <span class="llm-conf">${pct}%</span>
    </div>` : '';
  const summary = post.llmSummary
    ? `<div class="llm-summary">${highlightLlmText(escapeHtml(post.llmSummary))}</div>`
    : '';
  const reasoning = post.llmReasoning
    ? `<div class="llm-reasoning">${highlightLlmText(escapeHtml(post.llmReasoning))}</div>`
    : '';
  return `
    <div class="llm-cell">
      <div class="llm-tag-row"><span class="llm-tag llm-${cssVerdict}">${label}</span>${disagreeBadge}${staleChip}</div>
      ${confBar}
      ${summary}
      ${reasoning}
    </div>
  `;
};

const updateSummary = (rows = filteredSortedPosts()) => {
  const totalChecked = state.posts.filter((p) => p.checked).length;
  const totalArchived = state.posts.filter((p) => p.archived).length;
  const archivedPart = totalArchived > 0 ? ` · ${totalArchived} archived` : '';
  $('#resultsSummary').textContent =
    `${rows.length} shown · ${state.posts.length} total · ${totalChecked} checked${archivedPart}`;

  const footer = $('#tableFooter');
  if (rows.length === 0) { footer.hidden = true; return; }
  const viewChecked = rows.filter((p) => p.checked).length;
  const viewArchived = rows.filter((p) => p.archived).length;
  const archivedChip = viewArchived > 0
    ? `<span class="footer-chip footer-archived">${viewArchived} archived</span>`
    : '';
  footer.innerHTML = `<span class="footer-chip footer-checked">${viewChecked} / ${rows.length} reviewed</span>${archivedChip}`;
  footer.hidden = false;
};

const renderResults = () => {
  const rows = filteredSortedPosts();
  updateSummary(rows);

  const tbody = $('#resultsTbody');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const post of rows) {
    const tr = document.createElement('tr');
    if (post.checked) tr.classList.add('checked');
    if (post.archived) tr.classList.add('archived');
    tr.dataset.idx = post.index;
    if (post.llmVerdict) tr.dataset.llmVerdict = post.llmVerdict;

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
      <td class="col-archived">
        <input type="checkbox" class="archived-box" ${post.archived ? 'checked' : ''} data-idx="${post.index}" />
      </td>
      <td class="col-stars" data-stars="${post.stars || 1}">
        <div class="score-cell">
          ${renderStars(post.stars || 1)}
          <span class="raw">raw score ${post.rawScore ?? 0}</span>
        </div>
      </td>
      <td class="col-llm">${renderLlmCell(post)}</td>
      <td class="col-subject">
        <a class="post-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">
          ${escapeHtml(post.subject || '(no subject)')}
        </a>
        <div class="post-snippet">${escapeHtml(shorten(post.body, 160))}</div>
        ${keywords ? `<div class="post-keywords">${keywords}</div>` : ''}
      </td>
      <td class="col-overlap">${renderOverlapCell(post)}</td>
      <td class="col-why">
        ${reasons ? `<ul class="why-list">${reasons}</ul>` : '<span class="muted">No archive signals.</span>'}
      </td>
      <td class="col-author col-meta">${escapeHtml(post.author || '—')}</td>
      <td class="col-date col-meta">${formatDate(post.postedAt)}</td>
      <td class="col-num col-meta">${renderNumCell(post.replies)}</td>
      <td class="col-num col-meta">${renderNumCell(post.kudos)}</td>
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
  updateSummary();
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

const handleArchivedToggle = async (e) => {
  const cb = e.target;
  if (!cb.classList.contains('archived-box')) return;
  const idx = parseInt(cb.dataset.idx, 10);
  const archived = cb.checked;
  const post = state.posts.find((p) => p.index === idx);
  if (post) post.archived = archived;
  cb.closest('tr').classList.toggle('archived', archived);
  updateSummary();
  try {
    const r = await fetch(`/api/sessions/${state.sessionId}/archived`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIndex: idx, archived }),
    });
    if (!r.ok) {
      const body = await r.text();
      let msg = 'Save failed';
      try { msg = JSON.parse(body).error || msg; } catch {}
      throw new Error(msg);
    }
  } catch (err) {
    showToast(err.message, true);
  }
};

const handleSessionNameSave = async () => {
  if (!state.sessionId) return;
  const name = $('#sessionNameInput').value.trim();
  if (name === state.sessionName) return;
  try {
    const r = await fetch(`/api/sessions/${state.sessionId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
    state.sessionName = name;
  } catch (err) {
    showToast(err.message, true);
  }
};

const resetFilters = () => {
  state.filter = { text: '', minStars: 0, llmVerdict: '' };
  $('#searchBox').value = '';
  $('#starFilter').value = '0';
  $('#llmFilter').value = '';
};

const applyTableMode = () => {
  const table = $('#resultsTable');
  const isReview = state.tableMode === 'review';
  table.classList.toggle('review-mode', isReview);
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.tableMode));
  localStorage.setItem('dt-table-mode', state.tableMode);
};

const handleModeToggle = (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn || btn.dataset.mode === state.tableMode) return;
  state.tableMode = btn.dataset.mode;
  applyTableMode();
};

const handleSearch = () => {
  state.filter.text = $('#searchBox').value;
  renderResults();
};
const handleStarFilter = () => {
  state.filter.minStars = parseInt($('#starFilter').value, 10) || 0;
  renderResults();
};
const handleLlmFilter = () => {
  state.filter.llmVerdict = $('#llmFilter').value;
  renderResults();
};

// ------------------------- Export / Import -------------------------
const EXPORT_COLUMNS = [
  ['index', (p) => p.index],
  ['stars', (p) => p.stars ?? ''],
  ['rawScore', (p) => p.rawScore ?? ''],
  ['subject', (p) => p.subject || ''],
  ['author', (p) => p.author || ''],
  ['postedAt', (p) => p.postedAt || ''],
  ['replies', (p) => p.replies ?? ''],
  ['kudos', (p) => p.kudos ?? ''],
  ['url', (p) => p.url || ''],
  ['docOverlapVerdict', (p) => p.docOverlapVerdict || ''],
  ['docOverlapMatched', (p) => p.docOverlapMatched ?? ''],
  ['keywords', (p) => (p.keywords || []).join('; ')],
  ['matchedTerms', (p) => (p.docOverlapMatchedTerms || []).join('; ')],
  ['docLatestMatchUrl', (p) => p.docLatestMatchUrl || ''],
  ['docLatestMatchAt', (p) => p.docLatestMatchAt || ''],
  ['docLatestMatchSource', (p) => p.docLatestMatchSource || ''],
  ['reasons', (p) => (p.reasons || []).join(' | ')],
  ['checked', (p) => (p.checked ? 'yes' : 'no')],
  ['llmVerdict', (p) => p.llmVerdict || ''],
  ['llmConfidence', (p) => (typeof p.llmConfidence === 'number' ? p.llmConfidence : '')],
  ['llmSummary', (p) => p.llmSummary || ''],
  ['body', (p) => p.body || ''],
];

const csvField = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCsv = (posts) => {
  const header = EXPORT_COLUMNS.map(([name]) => name).join(',');
  const rows = posts.map((p) => EXPORT_COLUMNS.map(([, get]) => csvField(get(p))).join(','));
  // Prepend a UTF-8 BOM so Excel opens it with the right encoding.
  return `﻿${[header, ...rows].join('\r\n')}`;
};

const buildJson = (posts, scope) => JSON.stringify({
  meta: {
    sessionId: state.sessionId,
    sourceFile: state.sourceFile,
    exportedAt: new Date().toISOString(),
    scope,
    count: posts.length,
  },
  posts: posts.map((p) => ({
    index: p.index,
    subject: p.subject || '',
    body: p.body || '',
    url: p.url || '',
    author: p.author || '',
    postedAt: p.postedAt || null,
    replies: p.replies ?? 0,
    kudos: p.kudos ?? 0,
    replyPosts: p.replyPosts || [],
    stars: p.stars ?? null,
    rawScore: p.rawScore ?? null,
    reasons: p.reasons || [],
    keywords: p.keywords || [],
    docOverlapVerdict: p.docOverlapVerdict || null,
    docOverlapMatched: p.docOverlapMatched ?? null,
    docOverlapMatchedTerms: p.docOverlapMatchedTerms || [],
    docLatestMatchUrl: p.docLatestMatchUrl || null,
    docLatestMatchAt: p.docLatestMatchAt || null,
    docLatestMatchSource: p.docLatestMatchSource || null,
    checked: !!p.checked,
    llmVerdict: p.llmVerdict || null,
    llmConfidence: p.llmConfidence ?? null,
    llmSummary: p.llmSummary || null,
    llmReasoning: p.llmReasoning || null,
    llmAnalyzedAt: p.llmAnalyzedAt || null,
  })),
}, null, 2);

const gatherExportPosts = (scope) => {
  if (scope === 'view') return filteredSortedPosts();
  const analyzed = state.posts.filter((p) => p.analyzed);
  if (scope === 'unchecked') return analyzed.filter((p) => !p.checked);
  return analyzed;
};

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportBaseName = (scope) => {
  const base = (state.sourceFile || 'archive-helper').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}_${scope}_${stamp}`;
};

const selectedExportScope = () =>
  ($('input[name="exportScope"]:checked') || {}).value || 'all';

// BATCH_SIZE must stay in sync with the batch-mode step 1 constant in SKILL.md
const BATCH_SIZE = 30;
const BATCH_THRESHOLD = 40;

const LLM_FILTER_LABELS = { archive: 'LLM: Archive', keep: 'LLM: Keep', review: 'LLM: Review (all)', 'review:stale': 'LLM: Stale answer', 'review:uncertain': 'LLM: Uncertain', disagree: 'LLM disagrees', none: 'No LLM verdict', 'stale:api-version': 'Stale: Old API version', 'stale:ui-path': 'Stale: Old UI path', 'stale:coming-soon': 'Stale: "Coming soon"', 'stale:not-possible': 'Stale: "Not possible"', 'stale:pricing': 'Stale: Pricing/licensing', 'stale:general': 'Stale: General' };

const updateExportCount = () => {
  const scope = selectedExportScope();
  const n = gatherExportPosts(scope).length;
  const countEl = $('#exportCount');
  const hintEl = $('#exportBatchHint');
  let countText = `${n} post${n === 1 ? '' : 's'} will be exported.`;
  if (scope === 'view' && state.filter.llmVerdict) {
    countText += ` (LLM filter active: ${LLM_FILTER_LABELS[state.filter.llmVerdict] || state.filter.llmVerdict})`;
  }
  countEl.textContent = countText;
  countEl.className = 'export-count' + (n === 0 ? ' muted' : '');
  if (n > BATCH_THRESHOLD) {
    const batches = Math.ceil(n / BATCH_SIZE);
    const mins = batches <= 10 ? '5–15' : batches <= 25 ? '15–40' : '40–90';
    hintEl.textContent = `The analyze-post-context skill will process this in ~${batches} batches of ${BATCH_SIZE} posts (est. ${mins} min). Consider filtering to "Unchecked only" to reduce scope.`;
    hintEl.hidden = false;
  } else {
    hintEl.hidden = true;
  }
};

const openExportDialog = () => {
  updateExportCount();
  $('#exportDialog').showModal();
};

const handleExportConfirm = () => {
  const scope = selectedExportScope();
  const posts = gatherExportPosts(scope);
  if (posts.length === 0) {
    showToast('Nothing to export for this scope.', true);
    return;
  }
  const base = exportBaseName(scope);
  downloadBlob(buildCsv(posts), `${base}.csv`, 'text/csv;charset=utf-8');
  // Small delay so the browser doesn't drop the second programmatic download.
  setTimeout(() => downloadBlob(buildJson(posts, scope), `${base}.json`, 'application/json'), 300);
  $('#exportDialog').close();
  showToast(`Exported ${posts.length} posts (CSV + JSON)`);
};

const handleImportLlm = () => $('#llmImportFile').click();

const handleLlmFileChosen = async (e) => {
  const file = e.target.files[0];
  if (!file || !state.sessionId) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const results = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(results)) throw new Error('File must be an array or { results: [...] }');
    const r = await fetch(`/api/sessions/${state.sessionId}/llm-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Import failed');
    showToast(`Imported ${data.matched} LLM verdict${data.matched === 1 ? '' : 's'}${data.skipped ? ` · ${data.skipped} skipped` : ''}${data.coerced ? ` · ${data.coerced} invalid verdict${data.coerced === 1 ? '' : 's'} coerced to "review"` : ''}`);
    await loadResults(state.sessionId);
  } catch (err) {
    showToast(`Import failed: ${err.message}`, true);
  } finally {
    e.target.value = '';
  }
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
    const displayName = escapeHtml(s.name || s.sourceFile || s.id);
    const subParts = [s.name ? escapeHtml(s.sourceFile || '') : null, `${s.postCount} posts`, `saved ${new Date(s.updatedAt).toLocaleString()}`].filter(Boolean);
    li.innerHTML = `
      <div class="session-meta">
        <span class="name">${displayName}</span>
        <span class="sub">${subParts.join(' · ')}</span>
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
  const viewState = { filter: { ...state.filter }, sort: { ...state.sort } };
  const r = await fetch(`/api/sessions/${state.sessionId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewState }),
  });
  if (r.ok) showToast('Session saved'); else showToast('Save failed', true);
};

const handleNewCsv = () => {
  resetFilters();
  handleFileCleared();
  $('#resultsSection').hidden = true;
  $('#progressSection').hidden = true;
  $('#uploadSection').hidden = false;
  $('#newCsvBtn').hidden = true;
  $('#topSaveBtn').hidden = true;
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
  $('#resultsTbody').addEventListener('change', handleArchivedToggle);
  $('#sessionNameInput').addEventListener('blur', handleSessionNameSave);
  $('#sessionNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#searchBox').addEventListener('input', handleSearch);
  $('#starFilter').addEventListener('change', handleStarFilter);
  $('#llmFilter').addEventListener('change', handleLlmFilter);
  $('#newCsvBtn').addEventListener('click', handleNewCsv);
  $('#loadSessionBtn').addEventListener('click', openSessionsDialog);
  $('#sessionsList').addEventListener('click', handleSessionsClick);
  $('#clearAllSessionsBtn').addEventListener('click', handleClearAllSessions);
  $('#saveSessionBtn').addEventListener('click', handleSaveSession);
  $('#topSaveBtn').addEventListener('click', handleSaveSession);
  $('#refreshCacheBtn').addEventListener('click', handleRefreshCache);
  $('#exportBtn').addEventListener('click', openExportDialog);
  $('#exportConfirmBtn').addEventListener('click', handleExportConfirm);
  $('#exportDialog').addEventListener('change', updateExportCount);
  $('#importLlmBtn').addEventListener('click', handleImportLlm);
  $('#llmImportFile').addEventListener('change', handleLlmFileChosen);
  $('#modeToggle').addEventListener('click', handleModeToggle);
  applyTableMode();
};

init();
