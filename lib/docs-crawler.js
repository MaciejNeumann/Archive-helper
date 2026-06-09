const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cheerio = require('cheerio');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'docs.json.gz');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SITEMAP_URLS = [
  'https://docs.dynatrace.com/sitemap.xml',
];
const BLOG_BASE_URL = 'https://www.dynatrace.com/news/blog/';
const MAX_PAGES = 1500;
const MAX_BLOG_INDEX_PAGES = 25;
const REQUEST_TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
};

const readCache = () => {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const gz = fs.readFileSync(CACHE_FILE);
    const json = zlib.gunzipSync(gz).toString('utf8');
    const data = JSON.parse(json);
    return data;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  ensureCacheDir();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'));
  fs.writeFileSync(CACHE_FILE, gz);
};

const isCacheFresh = (cache) => {
  if (!cache || !cache.fetchedAt) return false;
  return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
};

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'archive-helper/0.1 (Dynatrace Community internal)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const lastModifiedHeader = res.headers.get('last-modified');
    const text = await res.text();
    return { text, lastModified: lastModifiedHeader ? Date.parse(lastModifiedHeader) : null };
  } finally {
    clearTimeout(timer);
  }
};

const extractSitemapUrls = (xml) => {
  const urls = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
};

const extractTextFromHtml = (html) => {
  try {
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
};

const limitConcurrency = (concurrency) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    active++;
    fn().then(
      (r) => { active--; resolve(r); next(); },
      (e) => { active--; reject(e); next(); },
    );
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

const gatherSitemapUrls = async () => {
  const all = new Set();
  for (const sm of SITEMAP_URLS) {
    try {
      const { text } = await fetchWithTimeout(sm);
      const locs = extractSitemapUrls(text);
      const sublocs = locs.filter((u) => u.endsWith('.xml'));
      const pages = locs.filter((u) => !u.endsWith('.xml'));
      pages.forEach((u) => all.add(u));
      for (const sub of sublocs.slice(0, 20)) {
        try {
          const { text: subText } = await fetchWithTimeout(sub);
          extractSitemapUrls(subText).forEach((u) => { if (!u.endsWith('.xml')) all.add(u); });
        } catch {}
      }
    } catch {}
  }
  return [...all].slice(0, MAX_PAGES);
};

const gatherBlogUrls = async () => {
  const found = new Set();
  for (let page = 1; page <= MAX_BLOG_INDEX_PAGES; page++) {
    const url = page === 1 ? BLOG_BASE_URL : `${BLOG_BASE_URL}page/${page}/`;
    try {
      const { text } = await fetchWithTimeout(url);
      const $ = cheerio.load(text);
      const before = found.size;
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/news/blog/') && !href.includes('#')) {
          const abs = href.startsWith('http') ? href : `https://www.dynatrace.com${href}`;
          if (
            abs.split('/').filter(Boolean).length > 4 &&
            !/\/news\/blog\/(page|tag|category|author)\//i.test(abs)
          ) found.add(abs);
        }
      });
      if (found.size === before) break;
    } catch {
      break;
    }
  }
  return [...found].slice(0, 500);
};

const crawlPages = async (urls, onProgress) => {
  const limiter = limitConcurrency(CONCURRENCY);
  const pages = [];
  let done = 0;
  await Promise.all(urls.map((url) => limiter(async () => {
    try {
      const { text, lastModified } = await fetchWithTimeout(url);
      const body = extractTextFromHtml(text);
      if (body.length > 100) pages.push({ url, text: body.slice(0, 50000), lastModified });
    } catch {}
    done++;
    if (onProgress && done % 25 === 0) onProgress(done, urls.length);
  })));
  return pages;
};

const buildKeywordIndex = (pages, tokenize) => {
  const index = new Map();
  pages.forEach((page, pageIdx) => {
    const tokens = new Set(tokenize(page.text));
    for (const t of tokens) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(pageIdx);
    }
  });
  return index;
};

const ensureDocsCache = async ({ force = false, onProgress = null } = {}) => {
  const cache = readCache();
  if (!force && isCacheFresh(cache)) return cache;
  if (onProgress) onProgress({ phase: 'sitemap', done: 0, total: 0 });
  const [docUrls, blogUrls] = await Promise.all([gatherSitemapUrls(), gatherBlogUrls()]);
  const urls = [...new Set([...docUrls, ...blogUrls])];
  if (onProgress) onProgress({ phase: 'pages', done: 0, total: urls.length });
  const pages = await crawlPages(urls, (done, total) => {
    if (onProgress) onProgress({ phase: 'pages', done, total });
  });
  const data = {
    fetchedAt: Date.now(),
    pageCount: pages.length,
    pages,
  };
  writeCache(data);
  if (onProgress) onProgress({ phase: 'done', done: pages.length, total: pages.length });
  return data;
};

module.exports = {
  ensureDocsCache,
  buildKeywordIndex,
  readCache,
  CACHE_FILE,
};
