// ============================================
// HEROESVAULT FRONTEND API CONTROLLER (FUNNEL)
// ============================================

const DEFAULT_API_BASE = 'https://s-st-01.anteater-bushmaster.ts.net';
const PATCH_DATA_DIR = './data/patchnotes';
const MAP_DATA_DIR = './data/maps';

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

export function resolveApiBase() {
  const base =
    typeof window !== 'undefined' &&
    typeof window.HEROESVAULT_API_BASE === 'string' &&
    window.HEROESVAULT_API_BASE.trim()
      ? window.HEROESVAULT_API_BASE
      : typeof HEROESVAULT_API_BASE === 'string' && HEROESVAULT_API_BASE.trim()
        ? HEROESVAULT_API_BASE
        : DEFAULT_API_BASE;
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
export async function apiFetch(pathOrUrl, options = {}) {
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

async function fetchJsonWithFallback(remotePath, localPath, { cacheKey = '', force = false } = {}) {
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
        const res = await apiFetch(remotePath);
        if (res.ok) {
          data = await res.json();
        }
      } catch (err) {
        console.warn(`[api] Remote JSON failed for ${remotePath}, trying fallback:`, err);
      }
    }

    if (data === null && localPath) {
      try {
        const localRes = await fetch(localPath);
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

async function fetchTextWithFallback(remotePath, localPath, { cacheKey = '', force = false } = {}) {
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
        const res = await apiFetch(remotePath);
        if (res.ok) {
          text = await res.text();
        }
      } catch (err) {
        console.warn(`[api] Remote text failed for ${remotePath}, trying fallback:`, err);
      }
    }

    if (!text && localPath) {
      try {
        const localRes = await fetch(localPath);
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

export function clearApiCache(prefix = '') {
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

export function fetchPatchMasterFeed(file, { force = false } = {}) {
  const safeFile = String(file || '').trim();
  return fetchJsonWithFallback(
    `/api/patchnotes/${encodeURIComponent(safeFile)}`,
    `${PATCH_DATA_DIR}/${safeFile}`,
    { cacheKey: `patch-master:${safeFile}`, force }
  );
}

export function fetchAllPatchMasterFeeds({ force = false } = {}) {
  return Promise.all(
    MASTER_PATCH_FILES.map(async (file) => ({
      file,
      data: await fetchPatchMasterFeed(file, { force }),
    }))
  );
}

export function fetchPatchDetailRaw(detailPath, { force = false } = {}) {
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
    encodedSubpath ? `/api/patchnotes/detail/${encodedSubpath}` : '',
    localPath,
    { cacheKey: `patch-detail:${cleaned || raw}`, force }
  );
}

// --- Maps endpoints ---

export async function fetchMapDetails(id, { force = false } = {}) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return {};

  const encodedId = encodeURIComponent(cleanId);
  const data = await fetchJsonWithFallback(
    `/api/maps/${encodedId}`,
    `${MAP_DATA_DIR}/${encodedId}.json`,
    { cacheKey: `map:detail:${cleanId}`, force }
  );

  return data && typeof data === 'object' ? data : {};
}

// --- Academy endpoints ---

export function fetchAcademyList({ force = false } = {}) {
  return fetchJsonWithFallback('/api/academy', '', {
    cacheKey: 'academy:list',
    force,
  });
}

export function fetchAcademyArticleById(id, { force = false } = {}) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return Promise.resolve(null);
  return fetchJsonWithFallback(`/api/academy/${encodeURIComponent(cleanId)}`, '', {
    cacheKey: `academy:item:${cleanId}`,
    force,
  });
}

// --- Catalog / other endpoints ---

export function fetchHeroesMasterCatalog({ force = false } = {}) {
  return fetchJsonWithFallback('/api/catalog/heroes-master', '', {
    cacheKey: 'catalog:heroes-master',
    force,
  });
}

export function getApiController() {
  return {
    resolveApiBase,
    apiFetch,
    clearApiCache,
    fetchPatchMasterFeed,
    fetchAllPatchMasterFeeds,
    fetchPatchDetailRaw,
    fetchMapDetails,
    fetchAcademyList,
    fetchAcademyArticleById,
    fetchHeroesMasterCatalog,
  };
}

if (typeof window !== 'undefined') {
  window.HeroesVaultApi = Object.assign(window.HeroesVaultApi || {}, getApiController());
}
