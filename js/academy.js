// ============================================
// HEROESVAULT FRONTEND API CONTROLLER (FUNNEL)
// ============================================

(function () {
  const DEFAULT_API_BASE = 'https://s-st-01.anteater-bushmaster.ts.net';
  const PATCH_DATA_DIR = './data/patchnotes';
  const MAP_DATA_DIR = './data/maps';
  const ROTATION_DATA_DIR = './data';
  const DEFAULT_ROTATION_TIMEOUT_MS = 4000;

  const MASTER_PATCH_FILES = [
    'alpha-master.json',
    'beta-master.json',
    'live-master.json',
    'ptr-master.json',
  ];

  const JSON_CACHE = new Map();
  const INFLIGHT_JSON = new Map();
  const TEXT_CACHE = new Map();
  const INFLIGHT_TEXT = new Map();

  function resolveApiBase() {
    const globalBase = typeof HEROESVAULT_API_BASE === 'string' ? HEROESVAULT_API_BASE : '';
    const windowBase =
      typeof window !== 'undefined' && typeof window.HEROESVAULT_API_BASE === 'string'
        ? window.HEROESVAULT_API_BASE
        : '';
    const base = (windowBase && windowBase.trim()) || (globalBase && globalBase.trim()) || DEFAULT_API_BASE;
    return String(base || '').trim().replace(/\/+$/, '');
  }

  function buildApiUrl(pathOrUrl) {
    const raw = String(pathOrUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = resolveApiBase();
    const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
    return base ? `${base}${cleanPath}` : cleanPath;
  }

  /**
   * Single fetch funnel for frontend API calls.
   * Always stamps X-Client: frontend so telemetry filters internal/non-frontend traffic.
   */
  async function apiFetch(pathOrUrl, options = {}) {
    const url = buildApiUrl(pathOrUrl);
    const headers = new Headers(options.headers || {});
    if (!headers.has('X-Client')) {
      headers.set('X-Client', 'frontend');
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  async function fetchJsonWithFallback(
    remotePath,
    localPath,
    { cacheKey = '', force = false, fetchOptions = {} } = {}
  ) {
    if (!force && cacheKey && JSON_CACHE.has(cacheKey)) {
      return JSON_CACHE.get(cacheKey);
    }
    if (!force && cacheKey && INFLIGHT_JSON.has(cacheKey)) {
      return INFLIGHT_JSON.get(cacheKey);
    }

    const task = (async () => {
      let data = null;

      if (resolveApiBase() && remotePath) {
        try {
          const res = await apiFetch(remotePath, fetchOptions);
          if (res.ok) {
            data = await res.json();
          }
        } catch (err) {
          console.warn(`[api] Remote JSON failed for ${remotePath}, trying fallback:`, err);
        }
      }

      if (data === null && localPath) {
        try {
          const localRes = await fetch(localPath, fetchOptions);
          if (localRes.ok) {
            data = await localRes.json();
          }
        } catch (err) {
          console.warn(`[api] Local JSON failed for ${localPath}:`, err);
        }
      }

      if (data !== null && cacheKey) {
        JSON_CACHE.set(cacheKey, data);
      }
      return data;
    })().finally(() => {
      if (cacheKey && INFLIGHT_JSON.get(cacheKey) === task) {
        INFLIGHT_JSON.delete(cacheKey);
      }
    });

    if (cacheKey) {
      INFLIGHT_JSON.set(cacheKey, task);
    }
    return task;
  }

  async function fetchTextWithFallback(
    remotePath,
    localPath,
    { cacheKey = '', force = false, fetchOptions = {} } = {}
  ) {
    if (!force && cacheKey && TEXT_CACHE.has(cacheKey)) {
      return TEXT_CACHE.get(cacheKey);
    }
    if (!force && cacheKey && INFLIGHT_TEXT.has(cacheKey)) {
      return INFLIGHT_TEXT.get(cacheKey);
    }

    const task = (async () => {
      let text = '';

      if (resolveApiBase() && remotePath) {
        try {
          const res = await apiFetch(remotePath, fetchOptions);
          if (res.ok) {
            text = await res.text();
          }
        } catch (err) {
          console.warn(`[api] Remote text failed for ${remotePath}, trying fallback:`, err);
        }
      }

      if (!text && localPath) {
        try {
          const localRes = await fetch(localPath, fetchOptions);
          if (localRes.ok) {
            text = await localRes.text();
          }
        } catch (err) {
          console.warn(`[api] Local text failed for ${localPath}:`, err);
        }
      }

      if (text && cacheKey) {
        TEXT_CACHE.set(cacheKey, text);
      }
      return text;
    })().finally(() => {
      if (cacheKey && INFLIGHT_TEXT.get(cacheKey) === task) {
        INFLIGHT_TEXT.delete(cacheKey);
      }
    });

    if (cacheKey) {
      INFLIGHT_TEXT.set(cacheKey, task);
    }
    return task;
  }

  function clearApiCache(prefix = '') {
    if (!prefix) {
      JSON_CACHE.clear();
      TEXT_CACHE.clear();
      return;
    }
    for (const key of JSON_CACHE.keys()) {
      if (key.startsWith(prefix)) JSON_CACHE.delete(key);
    }
    for (const key of TEXT_CACHE.keys()) {
      if (key.startsWith(prefix)) TEXT_CACHE.delete(key);
    }
  }

  // --- Patchnotes endpoints ---

  function fetchPatchMasterFeed(file, { force = false } = {}) {
    const safeFile = String(file || '').trim();
    return fetchJsonWithFallback(
      `/api/patchnotes/${encodeURIComponent(safeFile)}`, `${PATCH_DATA_DIR}/${safeFile}`, { cacheKey: `patch-master:${safeFile}`, force }
    );
  }

  function fetchAllPatchMasterFeeds({ force = false } = {}) {
    return Promise.all(
      MASTER_PATCH_FILES.map(async (file) => ({
        file,
        data: await fetchPatchMasterFeed(file, { force }),
      }))
    );
  }

  function fetchPatchDetailRaw(detailPath, { force = false } = {}) {
    const raw = String(detailPath || '').trim();
    if (!raw) return Promise.resolve('');

    const cleaned = raw
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .replace(/^data\/patchnotes\//, '')
      .replace(/^patchnotes\//, '');

    const encodedSubpath = cleaned
      ? cleaned.split('/').filter(Boolean).map(encodeURIComponent).join('/')
      : '';

    const localPath = raw.startsWith('./') || raw.startsWith('data/')
      ? raw
      : `${PATCH_DATA_DIR}/${cleaned}`;

    return fetchTextWithFallback(
      encodedSubpath ? `/api/patchnotes/detail/${encodedSubpath}` : '', localPath, { cacheKey: `patch-detail:${cleaned || raw}`, force }
    );
  }

  // --- Maps endpoints ---

  async function fetchMapDetails(id, { force = false } = {}) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return {};

    const encodedId = encodeURIComponent(cleanId);
    const data = await fetchJsonWithFallback(
      `/api/maps/${encodedId}`, `${MAP_DATA_DIR}/${encodedId}.json`, { cacheKey: `map:detail:${cleanId}`, force }
    );

    return data && typeof data === 'object' ? data : {};
  }

  // --- Rotation endpoints ---

  async function fetchRotationData(
    { force = false, timeoutMs = DEFAULT_ROTATION_TIMEOUT_MS } = {}
  ) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const data = await fetchJsonWithFallback(
        '/api/rotation',
        `${ROTATION_DATA_DIR}/rotation.json`, { cacheKey: 'rotation:current', force, fetchOptions: { cache: 'no-store', signal: controller ? controller.signal : undefined, }, } );  return data && typeof data === 'object' ? data : {}; } finally { if (timer) clearTimeout(timer); } }  // --- Academy endpoints ---  function fetchAcademyList({ force = false } = {}) { return fetchJsonWithFallback('/api/academy', './data/academy.json', { cacheKey: 'academy:list', force, }); }  function fetchAcademyArticleById(id, { force = false } = {}) { const cleanId = String(id \vert{}\vert{} '').trim(); if (!cleanId) return Promise.resolve(null); return fetchJsonWithFallback(`/api/academy/${encodeURIComponent(cleanId)}`, '', {
      cacheKey: `academy:item:${cleanId}`, force, }); }  // --- Catalog / other endpoints ---  function fetchHeroesMasterCatalog({ force = false } = {}) { return fetchJsonWithFallback('/api/catalog/heroes-master', '', { cacheKey: 'catalog:heroes-master', force, }); }  function fetchBuildsCatalog({ force = false } = {}) { return fetchJsonWithFallback('/api/builds', '', { cacheKey: 'catalog:builds', force, }); }  function fetchMapsCatalog({ force = false } = {}) { return fetchJsonWithFallback('/api/maps', '', { cacheKey: 'catalog:maps', force, }); }  function fetchTierListCatalog({ force = false } = {}) { return fetchJsonWithFallback('/api/tierlist', '', { cacheKey: 'catalog:tierlist', force, }); }  function getApiController() { return { resolveApiBase, apiFetch, clearApiCache, fetchPatchMasterFeed, fetchAllPatchMasterFeeds, fetchPatchDetailRaw, fetchMapDetails, fetchRotationData, fetchAcademyList, fetchAcademyArticleById, fetchHeroesMasterCatalog, fetchBuildsCatalog, fetchMapsCatalog, fetchTierListCatalog, }; }  if (typeof window !== 'undefined') { window.HeroesVaultApi = Object.assign(window.HeroesVaultApi \vert{}\vert{} {}, getApiController()); } })(); ```  ---  ### `academy.js`  ```javascript // ========================================== // NEXUS ACADEMY MODULE (UI & RENDERING) // ==========================================  let academyState = { level: 'all', category: 'All', search: '', activeId: null, };  let academyIndexCache = null; let academyIndexInflight = null; let lastRenderedAcademySignature = null;  function extractAcademyArticlesArray(payload) { if (Array.isArray(payload)) return payload; if (payload && typeof payload === 'object') { if (Array.isArray(payload.articles)) return payload.articles; if (Array.isArray(payload.guides)) return payload.guides; if (Array.isArray(payload.items)) return payload.items; } return []; }  function normalizeAcademyArticle(raw, index = 0) { if (!raw \vert{}\vert{} typeof raw !== 'object') return null; const id = String(raw.id ?? raw.slug ?? raw.title ?? `guide-${index}`).trim();
  if (!id) return null;

  const levelRaw = String(raw.level ?? raw.difficulty ?? 'Basic').trim();
  const level = levelRaw.toLowerCase() === 'advanced' ? 'Advanced' : 'Basic';

  const markdown =
    typeof raw.markdown === 'string'
      ? raw.markdown
      : typeof raw.content === 'string'
        ? raw.content
        : typeof raw.body === 'string'
          ? raw.body
          : undefined;

  return {
    ...raw,
    id,
    title: String(raw.title ?? raw.name ?? 'Untitled Guide').trim(),
    category: String(raw.category ?? raw.topic ?? 'General').trim() || 'General',
    level,
    summary: String(raw.summary ?? raw.excerpt ?? raw.description ?? '').trim(),
    readTime: raw.readTime || raw.read_time || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    markdown,
  };
}

function getAcademyArticlesList() {
  return Array.isArray(academyIndexCache) ? academyIndexCache : [];
}

function ensureAcademyIndexLoaded({ force = false } = {}) {
  if (!force && Array.isArray(academyIndexCache)) {
    return Promise.resolve(academyIndexCache);
  }
  if (!force && academyIndexInflight) {
    return academyIndexInflight;
  }

  const api = typeof window !== 'undefined' ? window.HeroesVaultApi : null;
  const fetcher = api && typeof api.fetchAcademyList === 'function'
    ? api.fetchAcademyList.bind(api)
    : null;

  if (!fetcher) {
    academyIndexCache = [];
    return Promise.resolve([]);
  }

  academyIndexInflight = Promise.resolve(fetcher({ force }))
    .then((payload) => {
      const normalized = extractAcademyArticlesArray(payload)
        .map((item, idx) => normalizeAcademyArticle(item, idx))
        .filter(Boolean);

      if (Array.isArray(academyIndexCache) && academyIndexCache.length > 0) {
        const existingById = new Map(academyIndexCache.map((a) => [a.id, a]));
        academyIndexCache = normalized.map((item) => {
          const prev = existingById.get(item.id);
          if (typeof item.markdown !== 'string' && prev && typeof prev.markdown === 'string') {
            return { ...item, markdown: prev.markdown };
          }
          return item;
        });
      } else {
        academyIndexCache = normalized;
      }

      return academyIndexCache;
    })
    .catch((err) => {
      console.warn('[academy] Failed to load academy index:', err);
      if (!Array.isArray(academyIndexCache)) {
        academyIndexCache = [];
      }
      return academyIndexCache;
    })
    .finally(() => {
      academyIndexInflight = null;
    });

  return academyIndexInflight;
}

async function fetchAcademyArticleDetail(id, { force = false } = {}) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  const list = getAcademyArticlesList();
  const existing = list.find((a) => a.id === cleanId) || null;
  if (!force && existing && typeof existing.markdown === 'string') {
    return existing;
  }

  const api = typeof window !== 'undefined' ? window.HeroesVaultApi : null;
  const fetcher = api && typeof api.fetchAcademyArticleById === 'function'
    ? api.fetchAcademyArticleById.bind(api)
    : null;

  if (!fetcher) return existing;

  try {
    const rawDetail = await fetcher(cleanId, { force });
    const candidate =
      rawDetail && typeof rawDetail === 'object' && rawDetail.article && typeof rawDetail.article === 'object'
        ? rawDetail.article
        : rawDetail;
    const normalized = normalizeAcademyArticle(
      { ...(existing || {}), ...(candidate || {}), id: candidate?.id || cleanId }
    );

    if (normalized && Array.isArray(academyIndexCache)) {
      const idx = academyIndexCache.findIndex((a) => a.id === cleanId);
      if (idx >= 0) {
        academyIndexCache[idx] = {
          ...academyIndexCache[idx],
          ...normalized,
        };
        return academyIndexCache[idx];
      }
    }

    return normalized || existing;
  } catch (err) {
    console.warn(`[academy] Failed to load article detail for ${cleanId}:`, err);
    return existing;
  }
}

function getAcademyArticlesSafe() {
  const list = getAcademyArticlesList();
  return Array.isArray(list) ? list : [];
}

function getAcademyIndexLoaderSafe() {
  return ensureAcademyIndexLoaded;
}

function getAcademyArticleDetailFetcherSafe() {
  return fetchAcademyArticleDetail;
}

function getAcademyRenderSignature() {
  const articles = getAcademyArticlesSafe();
  const activeArticle = articles.find((a) => a.id === academyState.activeId);
  const activeMarkdownLen = typeof activeArticle?.markdown === 'string'
    ? activeArticle.markdown.length
    : -1;

  return [
    academyState.level,
    academyState.category,
    academyState.search,
    String(academyState.activeId ?? ''),
    String(articles.length),
    String(activeMarkdownLen),
  ].join('||');
}

function getAcademyCategories() {
  const articles = getAcademyArticlesSafe();
  const set = new Set(['All']);
  articles.forEach((a) => {
    if (a?.category) set.add(a.category);
  });
  return Array.from(set);
}

function escapeAcademyHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAcademyInline(text) {
  const raw = String(text ?? '');
  if (!raw) return '';

  const codeTokens = [];
  const withPlaceholders = raw.replace(/`([^`\r\n]+)`/g, (_, codeContent) => {
    const token = `\u0000ACADEMYCODE${codeTokens.length}\u0000`;
    codeTokens.push(
      `<code class="px-1.5 py-0.5 rounded bg-[#070414] border border-[#38247a] text-[#cbe8ff] font-mono text-xs">${escapeAcademyHtml(codeContent)}</code>`
    );
    return token;
  });

  let out = escapeAcademyHtml(withPlaceholders);

  out = out.replace(
    /\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g,
    '<strong class="font-bold text-[#e6ecff]">$1</strong>'
  );

  out = out.replace(
    /(^|[^*])\*([^\s*](?:[^*\r\n]*[^\s*])?)\*(?!\*)/g,
    '$1<em class="italic text-[#9cb6ff]">$2</em>'
  );

  return out.replace(/\u0000ACADEMYCODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] ?? '');
}

function renderAcademyMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listType = null;
  let quoteLines = [];
  let inCodeBlock = false;
  let codeLines = [];

  const flushList = () => {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const inner = quoteLines
      .map((l) => `<p class="text-xs text-[#cbe8ff]/95 leading-relaxed">${formatAcademyInline(l)}</p>`)
      .join('');
    html.push(`<blockquote class="border-l-4 border-[#58baff] bg-[#0063c8]/15 rounded-r-xl px-4 py-3 space-y-1">${inner}</blockquote>`);
    quoteLines = [];
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    const escapedCode = escapeAcademyHtml(codeLines.join('\n'));
    html.push(`<pre class="p-3 rounded bg-[#070414] border border-[#38247a] text-xs font-mono text-[#cbe8ff] overflow-x-auto"><code>${escapedCode}</code></pre>`);
    codeLines = [];
    inCodeBlock = false;
  };

  for (const rawLine of lines) {
    const trimmedStart = rawLine.trimStart();

    if (trimmedStart.startsWith('```')) {
      flushList();
      flushQuote();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushQuote();
      continue;
    }

    if (line.startsWith('>')) {
      flushList();
      quoteLines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();

    if (line.startsWith('### ')) {
      flushList();
      html.push(`<h3 class="text-base font-bold text-[#58baff] pt-2">${formatAcademyInline(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith('## ')) {
      flushList();
      html.push(`<h2 class="hots-display text-lg font-extrabold pt-2">${formatAcademyInline(line.slice(3))}</h2>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        html.push('<ol class="list-decimal list-inside space-y-1.5 text-sm text-[#e6ecff]/90 pl-1">');
        listType = 'ol';
      }
      html.push(`<li class="leading-relaxed">${formatAcademyInline(olMatch[1])}</li>`);
      continue;
    }

    if (line.startsWith('- ') || (line.startsWith('* ') && !line.startsWith('**'))) {
      if (listType !== 'ul') {
        flushList();
        html.push('<ul class="list-disc list-inside space-y-1.5 text-sm text-[#e6ecff]/90 pl-1">');
        listType = 'ul';
      }
      html.push(`<li class="leading-relaxed">${formatAcademyInline(line.slice(2))}</li>`);
      continue;
    }

    flushList();
    html.push(`<p class="text-sm text-[#e6ecff]/90 leading-relaxed">${formatAcademyInline(line)}</p>`);
  }

  flushCodeBlock();
  flushList();
  flushQuote();
  return html.join('\n');
}

function getFilteredAcademyArticles() {
  const articles = getAcademyArticlesSafe();
  const q = academyState.search.trim().toLowerCase();

  return articles.filter((article) => {
    const levelOk = academyState.level === 'all' || article.level === academyState.level;
    const catOk = academyState.category === 'All' || article.category === academyState.category;
    if (!levelOk || !catOk) return false;
    if (!q) return true;

    const haystack = [
      article.title,
      article.category,
      article.level,
      article.summary,
      ...(article.tags || []),
      article.markdown || '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

function syncAcademyLevelButtons() {
  document.querySelectorAll('.academy-level-btn, [data-academy-level]').forEach((btn) => {
    const active = btn.dataset.academyLevel === academyState.level;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('is-active', active);
  });
}

function setAcademyLevel(level) {
  if (academyState.level === level) return;
  academyState.level = level;
  lastRenderedAcademySignature = null;
  syncAcademyLevelButtons();
  renderAcademy();
}

function setAcademyCategory(category) {
  if (academyState.category === category) return;
  academyState.category = category;
  lastRenderedAcademySignature = null;
  renderAcademy();
}

function filterAcademyArticles() {
  const input = document.getElementById('academy-search');
  const nextSearch = input ? input.value : '';
  if (academyState.search === nextSearch) return;
  academyState.search = nextSearch;
  lastRenderedAcademySignature = null;
  renderAcademyListAndReader(false);
}

function selectAcademyArticle(id) {
  if (academyState.activeId === id) return;
  academyState.activeId = id;
  lastRenderedAcademySignature = null;
  renderAcademyListAndReader(true);
}

function renderAcademyCategories() {
  const container = document.getElementById('academy-category-tabs');
  if (!container) return;

  const categories = getAcademyCategories();
  const frag = document.createDocumentFragment();

  categories.forEach((cat) => {
    const active = academyState.category === cat;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active));
    btn.className = `academy-category-btn${active ? ' is-active' : ''}`;
    btn.textContent = cat;
    btn.addEventListener('click', () => setAcademyCategory(cat));
    frag.appendChild(btn);
  });

  container.replaceChildren(frag);
}

function buildAcademyArticleCardButton(article, isSelected) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `hots-list-item${isSelected ? ' is-selected' : ''}`;
  if (isSelected) {
    btn.setAttribute('aria-current', 'true');
  }

  const topRow = document.createElement('div');
  topRow.className = 'flex items-center justify-between gap-2 mb-1.5';

  const catEl = document.createElement('span');
  catEl.className = 'hots-list-item__meta';
  catEl.textContent = article.category || 'General';

  const isAdvanced = article.level === 'Advanced';
  const levelEl = document.createElement('span');
  levelEl.className = `hots-list-tag ${isAdvanced ? 'hots-list-tag--gold' : 'hots-list-tag--cyan'} shrink-0`;
  levelEl.textContent = article.level || 'Basic';

  topRow.append(catEl, levelEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'hots-list-item__title text-xs font-bold leading-snug';
  titleEl.textContent = article.title || 'Untitled Guide';

  btn.append(topRow, titleEl);
  btn.addEventListener('click', () => selectAcademyArticle(article.id));
  return btn;
}

function renderAcademyListAndReader(scrollReader) {
  const listEl = document.getElementById('academy-article-list');
  const readerEl = document.getElementById('academy-article-reader');
  if (!listEl || !readerEl) return;

  const filtered = getFilteredAcademyArticles();

  if (filtered.length === 0) {
    academyState.activeId = null;
    lastRenderedAcademySignature = null;

    const emptyListMsg = document.createElement('div');
    emptyListMsg.className = 'text-xs text-[#8c83a2] p-3 text-center';
    emptyListMsg.textContent = 'No guides match your current filter.';
    listEl.replaceChildren(emptyListMsg);

    const emptyReader = document.createElement('div');
    emptyReader.className = 'text-center py-10 space-y-2';

    const heading = document.createElement('p');
    heading.className = 'text-sm font-bold text-[#e6ecff]';
    heading.textContent = 'No matching Academy articles';

    const sub = document.createElement('p');
    sub.className = 'text-xs text-[#8c83a2]';
    sub.textContent = 'Try clearing your search or switching Basic / Advanced / Category filters.';

    emptyReader.append(heading, sub);
    readerEl.replaceChildren(emptyReader);
    return;
  }

  if (!filtered.some((a) => a.id === academyState.activeId)) {
    academyState.activeId = filtered[0].id;
  }

  const activeIndex = filtered.findIndex((a) => a.id === academyState.activeId);
  const activeArticle = filtered[activeIndex] || filtered[0];

  const listFrag = document.createDocumentFragment();
  filtered.forEach((article) => {
    listFrag.appendChild(buildAcademyArticleCardButton(article, article.id === activeArticle.id));
  });
  listEl.replaceChildren(listFrag);

  const detailFetcher = getAcademyArticleDetailFetcherSafe();
  if (typeof activeArticle.markdown !== 'string' && detailFetcher) {
    const targetId = activeArticle.id;
    Promise.resolve(detailFetcher(targetId)).then((fullArticle) => {
      if (!fullArticle || typeof fullArticle.markdown !== 'string') return;
      if (academyState.activeId !== targetId) return;
      lastRenderedAcademySignature = null;
      renderAcademyListAndReader(false);
    });
  }

  const prevArticle = activeIndex > 0 ? filtered[activeIndex - 1] : null;
  const nextArticle = activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

  const readerFrag = document.createDocumentFragment();

  const header = document.createElement('div');
  header.className = 'space-y-2 pb-4 border-b border-[#38247a]';

  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-3 text-xs';

  const catLabel = document.createElement('span');
  catLabel.className = 'hots-list-tag hots-list-tag--meta hots-list-tag--active';
  catLabel.textContent = activeArticle.category || 'General';

  const isAdvanced = activeArticle.level === 'Advanced';
  const levelLabel = document.createElement('span');
  levelLabel.className = `hots-list-tag ${isAdvanced ? 'hots-list-tag--gold' : 'hots-list-tag--cyan'} hots-list-tag--active`;
  levelLabel.textContent = activeArticle.level || 'Basic';

  metaRow.append(catLabel, levelLabel);

  if (activeArticle.readTime) {
    const readTimeEl = document.createElement('span');
    readTimeEl.className = 'text-[#8c83a2] font-mono text-[11px]';
    readTimeEl.textContent = activeArticle.readTime;
    metaRow.appendChild(readTimeEl);
  }

  const titleHeading = document.createElement('h3');
  titleHeading.className = 'hots-display text-2xl font-extrabold';
  titleHeading.textContent = activeArticle.title || 'Untitled Guide';

  header.append(metaRow, titleHeading);

  if (activeArticle.summary) {
    const summaryEl = document.createElement('p');
    summaryEl.className = 'text-sm text-[#9cb6ff]/90 leading-relaxed';
    summaryEl.textContent = activeArticle.summary;
    header.appendChild(summaryEl);
  }

  const bodyContainer = document.createElement('div');
  bodyContainer.className = 'space-y-3';
  bodyContainer.innerHTML =
    typeof activeArticle.markdown === 'string'
      ? renderAcademyMarkdown(activeArticle.markdown)
      : '<p class="text-xs text-[#8c83a2]">Loading guide content...</p>';

  const navEl = document.createElement('div');
  navEl.id = 'academy-article-nav';
  navEl.className = 'pt-4 border-t border-[#38247a] flex items-center justify-between gap-3';

  if (prevArticle) {
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'px-3.5 py-2 rounded bg-[#0c0621] hover:bg-[#1d1247] border border-[#38247a] hover:border-[#5c42b8] text-xs font-semibold text-[#cbe8ff] transition cursor-pointer';
    prevBtn.textContent = `← ${prevArticle.title}`;
    prevBtn.addEventListener('click', () => selectAcademyArticle(prevArticle.id));
    navEl.appendChild(prevBtn);
  } else {
    navEl.appendChild(document.createElement('span'));
  }

  if (nextArticle) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'px-3.5 py-2 rounded bg-[#0c0621] hover:bg-[#1d1247] border border-[#38247a] hover:border-[#5c42b8] text-xs font-semibold text-[#cbe8ff] transition cursor-pointer';
    nextBtn.textContent = `${nextArticle.title} →`;
    nextBtn.addEventListener('click', () => selectAcademyArticle(nextArticle.id));
    navEl.appendChild(nextBtn);
  } else {
    navEl.appendChild(document.createElement('span'));
  }

  readerFrag.append(header, bodyContainer, navEl);
  readerEl.replaceChildren(readerFrag);

  if (scrollReader && window.innerWidth < 1024) {
    readerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindAcademyEvents() {
  syncAcademyLevelButtons();

  document.querySelectorAll('[data-academy-level]').forEach((btn) => {
    if (btn.dataset.academyLevelBound === 'true') return;
    btn.dataset.academyLevelBound = 'true';
    const level = btn.getAttribute('data-academy-level');
    btn.addEventListener('click', () => setAcademyLevel(level));
  });

  const searchInput = document.getElementById('academy-search');
  if (searchInput && searchInput.dataset.academySearchBound !== 'true') {
    searchInput.dataset.academySearchBound = 'true';
    searchInput.addEventListener('input', filterAcademyArticles);
  }
}

function renderAcademy() {
  bindAcademyEvents();

  const loadIndex = getAcademyIndexLoaderSafe();

  if (academyIndexCache === null && !academyIndexInflight && loadIndex) {
    Promise.resolve(loadIndex()).then(() => {
      if (!academyState.activeId) {
        academyState.activeId = getAcademyArticlesSafe()[0]?.id || null;
      }
      lastRenderedAcademySignature = null;
      renderAcademyCategories();
      renderAcademyListAndReader(false);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    });
  }

  if (!academyState.activeId) {
    academyState.activeId = getAcademyArticlesSafe()[0]?.id || null;
  }

  const sig = getAcademyRenderSignature();
  if (sig === lastRenderedAcademySignature) {
    return;
  }
  lastRenderedAcademySignature = sig;

  renderAcademyCategories();
  renderAcademyListAndReader(false);
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

const initAcademyModule = () => {
  bindAcademyEvents();
  const loadIndex = getAcademyIndexLoaderSafe();
  if (loadIndex) {
    Promise.resolve(loadIndex()).then(() => {
      renderAcademy();
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAcademyModule, { once: true });
} else {
  initAcademyModule();
}
