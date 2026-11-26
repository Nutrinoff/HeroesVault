// ==========================================
// 1. HERO SIDEBAR, SEARCH & LAZY PRELOADING
// ==========================================

const HERO_SCROLL_SETTLE_DELAY_MS = 180;
const HERO_SEARCH_DEBOUNCE_MS = 100;
const HERO_SEARCH_PRELOAD_DELAY_MS = 75;
const HERO_FALLBACK_PORTRAIT = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" fill="#0d0724"/><rect x="1" y="1" width="108" height="108" fill="none" stroke="#38247a" stroke-width="2"/><text x="55" y="64" fill="#9cb6ff" font-family="monospace" font-size="34" text-anchor="middle">?</text></svg>')}`;

const PRELOADED_HERO_KEYS = new Set();
const PENDING_VISIBLE_HERO_IDS = new Set();

let heroSearchDebounceTimer = null;
let heroSearchPreloadTimer = null;
let heroListObserver = null;
let observedHeroElements = new WeakSet();
let heroScrollIdleTimer = null;
let isHeroListScrolling = false;
let sidebarHeightResizeObserver = null;
let sidebarHeightRafId = null;
let desktopSidebarMediaQuery = null;
let lastRenderedOrderKey = null;
let lastRenderedActiveKey = null;

let heroIndexCache = {
    sourceRef: null,
    sourceLen: -1,
    snapshotSignature: '',
    sortedEntries: [],
    byKey: new Map()
};

function getCatalogApi() {
    return window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog === 'object'
        ? window.HeroesVaultCatalog
        : null;
}

function getDomApi() {
    return window.HeroesVaultDom && typeof window.HeroesVaultDom === 'object'
        ? window.HeroesVaultDom
        : null;
}

function toNormalizedHeroKey(value) {
    const catalog = getCatalogApi();
    if (catalog && typeof catalog.normalizeKey === 'function') {
        return catalog.normalizeKey(value);
    }
    if (typeof normalizeHeroKey === 'function') {
        return normalizeHeroKey(value);
    }
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function escapeSidebarHtml(value) {
    const dom = getDomApi();
    if (dom && typeof dom.escapeHtml === 'function') {
        return dom.escapeHtml(value);
    }
    if (typeof escapeHtml === 'function') {
        return escapeHtml(value);
    }
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getHeroDisplayName(hero) {
    return String(hero?.name || hero?.id || '').trim();
}

function getSidebarFallbackPortrait() {
    return typeof HERO_VIEW_ICON_FALLBACK === 'string'
        ? HERO_VIEW_ICON_FALLBACK
        : HERO_FALLBACK_PORTRAIT;
}

function resolveCatalogHeroRecord(hero) {
    const catalog = getCatalogApi();
    if (!catalog || typeof catalog.getHero !== 'function' || !hero) return null;
    return catalog.getHero(hero.id) || catalog.getHero(hero.name) || null;
}

function normalizeTierBadge(rawTier) {
    const str = String(rawTier ?? '').trim();
    if (!str) return '';
    const match = str.match(/\b([SABCDF])\b/i) || str.match(/^([SABCDF])\s*(?:tier)?$/i);
    return match ? match[1].toUpperCase() : '';
}

function resolveSidebarHeroTier(hero, catalogHero = null, normHero = null, resolvedId = '') {
    const directTier = normalizeTierBadge(
        catalogHero?.tier
        ?? normHero?.tier
        ?? hero?.tier
    );
    if (directTier) return directTier;

    const catalog = getCatalogApi();
    const candidates = [
        resolvedId,
        hero?.id,
        catalogHero?.id,
        normHero?.id,
        hero?.name,
        catalogHero?.name,
        normHero?.name
    ].filter(Boolean);

    if (catalog && typeof catalog.getTier === 'function') {
        for (const candidate of candidates) {
            const tier = normalizeTierBadge(catalog.getTier(candidate));
            if (tier) return tier;
        }
    }

    if (typeof getHeroTier === 'function') {
        for (const candidate of candidates) {
            const tier = normalizeTierBadge(getHeroTier(candidate));
            if (tier) return tier;
        }
    }

    return 'D';
}

function buildHeroRosterSnapshotSignature(list) {
    if (!Array.isArray(list) || list.length === 0) return '';

    return list
        .map(hero => {
            if (!hero || typeof hero !== 'object') return '';
            const catalogHero = resolveCatalogHeroRecord(hero);
            const normHero = catalogHero?.normHero
                || (typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(hero.id) : null);
            const resolvedId = String(catalogHero?.id || normHero?.id || hero.id || '').trim();
            const tier = resolveSidebarHeroTier(hero, catalogHero, normHero, resolvedId);
            return [
                resolvedId,
                hero.id || '',
                hero.name || '',
                catalogHero?.name || normHero?.name || '',
                catalogHero?.role || normHero?.role || hero.role || '',
                catalogHero?.portrait || normHero?.portrait || hero.portrait || '',
                tier
            ].join('~');
        })
        .join('||');
}

function buildHeroSidebarEntry(hero, fallbackPortrait) {
    const catalog = getCatalogApi();
    const catalogHero = resolveCatalogHeroRecord(hero);
    const normHero = catalogHero?.normHero
        || (typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(hero.id) : null);
    const resolvedId = String(catalogHero?.id || normHero?.id || hero.id || '').trim();
    const primaryKey = toNormalizedHeroKey(resolvedId || hero.id);

    const aliasSource = Array.isArray(catalogHero?.aliases) && catalogHero.aliases.length > 0
        ? [...catalogHero.aliases, hero.id, hero.name, resolvedId, normHero?.name]
        : [hero.id, hero.name, resolvedId, normHero?.name];

    const aliasKeys = new Set(
        aliasSource
            .map(toNormalizedHeroKey)
            .filter(Boolean)
    );

    const displayName = getHeroDisplayName(catalogHero || normHero || hero) || 'Hero';
    const role = catalogHero?.role || normHero?.role || hero.role || 'Nexus Combatant';
    const tier = resolveSidebarHeroTier(hero, catalogHero, normHero, resolvedId);

    const catalogAsset = catalog && typeof catalog.getAssetMeta === 'function'
        ? catalog.getAssetMeta(resolvedId || hero.id)
        : null;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(resolvedId) : null;
    const portraitUrl = catalogAsset?.url
        || (typeof resolveAssetUrl === 'function'
            ? resolveAssetUrl(catalogAsset?.source || normHero?.portrait || hero.portrait || rawEntry, fallbackPortrait)
            : fallbackPortrait);

    const searchLower = catalogHero?.searchLower || [
        hero.searchText,
        hero.name,
        hero.id,
        normHero?.name,
        normHero?.id,
        role
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const searchNorm = catalogHero?.searchNorm || toNormalizedHeroKey(searchLower);

    return {
        hero,
        normHero,
        resolvedId,
        primaryKey,
        aliasKeys,
        displayName,
        safeName: escapeSidebarHtml(displayName),
        safeRole: escapeSidebarHtml(role),
        tier,
        safeTier: escapeSidebarHtml(tier),
        portraitUrl,
        searchLower,
        searchNorm
    };
}

function getPreparedHeroRoster(heroes) {
    const list = Array.isArray(heroes) ? heroes : [];
    const fallbackPortrait = getSidebarFallbackPortrait();
    const snapshotSignature = buildHeroRosterSnapshotSignature(list);

    if (
        heroIndexCache.sourceRef === list &&
        heroIndexCache.sourceLen === list.length &&
        heroIndexCache.snapshotSignature === snapshotSignature &&
        heroIndexCache.sortedEntries.length > 0
    ) {
        return heroIndexCache;
    }

    const entries = [];
    const byKey = new Map();

    for (const h of list) {
        if (!h || typeof h !== 'object') continue;
        const entry = buildHeroSidebarEntry(h, fallbackPortrait);
        entries.push(entry);
        for (const key of entry.aliasKeys) {
            if (!byKey.has(key)) {
                byKey.set(key, entry);
            }
        }
    }

    entries.sort((a, b) => {
        const byName = a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: 'base',
            numeric: true
        });
        if (byName !== 0) return byName;

        return a.resolvedId.localeCompare(b.resolvedId, undefined, {
            sensitivity: 'base',
            numeric: true
        });
    });

    if (heroIndexCache.snapshotSignature && heroIndexCache.snapshotSignature !== snapshotSignature) {
        lastRenderedOrderKey = null;
    }

    heroIndexCache = {
        sourceRef: list,
        sourceLen: list.length,
        snapshotSignature,
        sortedEntries: entries,
        byKey
    };

    return heroIndexCache;
}

function sortHeroesByDisplayName(heroes) {
    return getPreparedHeroRoster(heroes).sortedEntries.map(entry => entry.hero);
}

function getSidebarTargetBottomEl() {
    const builderView = document.getElementById('view-builder');
    if (builderView && !builderView.classList.contains('hidden')) {
        const sections = builderView.querySelectorAll('section');
        return sections.length ? sections[sections.length - 1] : builderView;
    }

    const buildsView = document.getElementById('view-builds');
    if (buildsView && !buildsView.classList.contains('hidden')) {
        return buildsView;
    }

    return null;
}

function isDesktopSidebarViewport() {
    if (!desktopSidebarMediaQuery && typeof window.matchMedia === 'function') {
        desktopSidebarMediaQuery = window.matchMedia('(min-width: 1024px)');
    }
    return desktopSidebarMediaQuery ? desktopSidebarMediaQuery.matches : window.innerWidth >= 1024;
}

function syncSidebarHeightToContent() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    if (!isDesktopSidebarViewport() || sidebar.classList.contains('hidden')) {
        if (sidebar.style.height) sidebar.style.height = '';
        return;
    }

    const targetEl = getSidebarTargetBottomEl();
    if (!targetEl) {
        if (sidebar.style.height) sidebar.style.height = '';
        return;
    }

    const sidebarRect = sidebar.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const matchedHeight = Math.round(targetRect.bottom - sidebarRect.top);
    const nextHeight = matchedHeight > 200 ? `${matchedHeight}px` : '';

    if (sidebar.style.height !== nextHeight) {
        sidebar.style.height = nextHeight;
    }
}

function scheduleSidebarHeightSync() {
    if (sidebarHeightRafId !== null) return;
    sidebarHeightRafId = requestAnimationFrame(() => {
        sidebarHeightRafId = null;
        syncSidebarHeightToContent();
    });
}

function bindSidebarHeightSync() {
    if (window._hotsSidebarHeightBound) return;
    window._hotsSidebarHeightBound = true;

    window.addEventListener('resize', scheduleSidebarHeightSync, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
        sidebarHeightResizeObserver = new ResizeObserver(scheduleSidebarHeightSync);

        ['view-builder', 'view-builds'].forEach(id => {
            const el = document.getElementById(id);
            if (el) sidebarHeightResizeObserver.observe(el);
        });
    }
}

function preloadHeroIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const catalog = getCatalogApi();
    const rawEntries = [];
    for (const id of ids) {
        if (!id) continue;
        const catalogHero = catalog && typeof catalog.getHero === 'function' ? catalog.getHero(id) : null;
        const normInfo = catalogHero?.normHero
            || (typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(id) : null);
        const resolvedId = catalogHero?.id || normInfo?.id || id;
        const canonicalKey = toNormalizedHeroKey(resolvedId);
        if (!canonicalKey || PRELOADED_HERO_KEYS.has(canonicalKey)) continue;

        const raw = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(resolvedId) : null;
        if (!raw && !normInfo && !catalogHero) continue;

        PRELOADED_HERO_KEYS.add(canonicalKey);
        if (raw) {
            rawEntries.push(raw);
        }
    }

    if (rawEntries.length > 0 && typeof preloadAllAssets === 'function') {
        preloadAllAssets(rawEntries);
    }
}

function warmSearchMatches(matches) {
    if (!Array.isArray(matches) || matches.length === 0) return;
    preloadHeroIds(matches.slice(0, 3).map(m => m.resolvedId || m.id));
}

function cancelPendingVisibleHeroPreload() {
    clearTimeout(heroScrollIdleTimer);
    heroScrollIdleTimer = null;
    PENDING_VISIBLE_HERO_IDS.clear();
}

function flushVisibleHeroPreload() {
    heroScrollIdleTimer = null;
    if (isHeroListScrolling || PENDING_VISIBLE_HERO_IDS.size === 0) return;

    const ids = Array.from(PENDING_VISIBLE_HERO_IDS);
    PENDING_VISIBLE_HERO_IDS.clear();
    preloadHeroIds(ids);
}

function scheduleVisibleHeroPreloadAfterIdle() {
    if (isHeroListScrolling || PENDING_VISIBLE_HERO_IDS.size === 0) return;
    clearTimeout(heroScrollIdleTimer);
    heroScrollIdleTimer = setTimeout(flushVisibleHeroPreload, HERO_SCROLL_SETTLE_DELAY_MS);
}

function handleHeroListScroll(listEl) {
    isHeroListScrolling = true;
    cancelPendingVisibleHeroPreload();

    clearTimeout(listEl._scrollSettleTimer);
    listEl._scrollSettleTimer = setTimeout(() => {
        isHeroListScrolling = false;
        scheduleVisibleHeroPreloadAfterIdle();
    }, HERO_SCROLL_SETTLE_DELAY_MS);
}

function ensureHeroListObserver(listEl) {
    if (!listEl || typeof IntersectionObserver === 'undefined') return null;

    if (!listEl.dataset.idlePreloadBound) {
        listEl.dataset.idlePreloadBound = 'true';
        listEl.addEventListener('scroll', () => handleHeroListScroll(listEl), { passive: true });
        listEl.addEventListener('wheel', cancelPendingVisibleHeroPreload, { passive: true });
        listEl.addEventListener('touchmove', cancelPendingVisibleHeroPreload, { passive: true });
    }

    if (!heroListObserver) {
        heroListObserver = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    const heroId = entry.target?.dataset?.heroId;
                    if (!heroId) continue;

                    const key = toNormalizedHeroKey(heroId);
                    if (entry.isIntersecting) {
                        if (!PRELOADED_HERO_KEYS.has(key)) {
                            PENDING_VISIBLE_HERO_IDS.add(heroId);
                        }
                    } else {
                        PENDING_VISIBLE_HERO_IDS.delete(heroId);
                    }
                }

                if (!isHeroListScrolling) {
                    scheduleVisibleHeroPreloadAfterIdle();
                }
            },
            {
                root: listEl,
                rootMargin: '0px',
                threshold: 0.25
            }
        );
    }

    return heroListObserver;
}

function syncHeroListObserverTargets(listEl, buttons = null, { resetAll = false } = {}) {
    const observer = ensureHeroListObserver(listEl);
    if (!observer) return;

    if (resetAll) {
        observer.disconnect();
        observedHeroElements = new WeakSet();
        cancelPendingVisibleHeroPreload();
    }

    const targets = buttons || listEl.querySelectorAll('[data-hero-id]');
    for (let i = 0; i < targets.length; i++) {
        const btn = targets[i];
        if (!observedHeroElements.has(btn)) {
            observedHeroElements.add(btn);
            observer.observe(btn);
        }
    }
}

function navigateFromSidebar(heroId, isBuilderView) {
    if (!heroId || typeof navigateTo !== 'function') return;
    navigateTo(isBuilderView ? 'builder' : 'builds', { hero: heroId });
}

function applyHeroSidebarPortraitFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    const dom = getDomApi();
    if (dom && typeof dom.attachImageFallback === 'function') {
        dom.attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    if (typeof attachImageFallback === 'function') {
        attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    imgEl.addEventListener('error', () => {
        if (imgEl.src !== fallbackUrl) {
            imgEl.src = fallbackUrl;
        }
    }, { once: true });
}

function syncSidebarSelectionInDom(listEl, activeKey, isBuilder) {
    const buttons = listEl.querySelectorAll('button[data-hero-id]');
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const btnId = btn.dataset.heroId || '';
        const btnKey = toNormalizedHeroKey(btnId);
        const isSelected = Boolean(activeKey) && btnKey === activeKey;
        btn.classList.toggle('is-selected', isSelected);
        if (isSelected) {
            btn.setAttribute('aria-current', 'true');
        } else {
            btn.removeAttribute('aria-current');
        }
        btn.dataset.sidebarBuilderMode = isBuilder ? 'true' : 'false';
    }
}

function renderPreparedHeroSidebar(entries, byKey = heroIndexCache.byKey) {
    bindHeroSidebarEvents();

    const list = document.getElementById('hero-list');
    if (!list) return;

    const sortedEntries = Array.isArray(entries) ? entries : [];
    const isBuilder = !document.getElementById('view-builder')?.classList.contains('hidden');
    const activeId = isBuilder ? builderHeroId : currentSelectedHeroId;
    const activeEntry = activeId && byKey instanceof Map
        ? byKey.get(toNormalizedHeroKey(activeId))
        : null;
    const activeKey = activeEntry?.primaryKey || toNormalizedHeroKey(activeId);

    const orderKey = sortedEntries.map(e => e.resolvedId).join('|');
    const hasSameStructure =
        list.children.length === sortedEntries.length &&
        list.children.length > 0 &&
        lastRenderedOrderKey === orderKey;

    if (hasSameStructure) {
        syncSidebarSelectionInDom(list, activeKey, isBuilder);
        lastRenderedActiveKey = activeKey;
        syncHeroListObserverTargets(list, null, { resetAll: false });
        bindSidebarHeightSync();
        scheduleSidebarHeightSync();
        return;
    }

    const fallbackPortrait = getSidebarFallbackPortrait();
    const frag = document.createDocumentFragment();
    const createdButtons = [];

    sortedEntries.forEach(entry => {
        const isSelected = Boolean(activeKey) && (
            entry.primaryKey === activeKey ||
            entry.aliasKeys.has(activeKey)
        );

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.heroId = entry.resolvedId;
        btn.dataset.sidebarBuilderMode = isBuilder ? 'true' : 'false';
        btn.className = `hots-list-item hots-list-item--hero${isSelected ? ' is-selected' : ''}`;
        if (isSelected) {
            btn.setAttribute('aria-current', 'true');
        }

        btn.addEventListener('click', () => {
            const builderActive = btn.dataset.sidebarBuilderMode === 'true';
            navigateFromSidebar(entry.resolvedId, builderActive);
        });

        btn.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="hex-sidebar-frame">
                    <img alt="${entry.safeName}" class="hex-sidebar-img" loading="lazy">
                    <svg class="hex-sidebar-ring" viewBox="0 0 100 100" aria-hidden="true">
                        <polygon
                            points="50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2"
                            fill="none"
                            stroke="rgba(88, 186, 255, 0.85)"
                            stroke-width="4.5"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="hots-list-item__title text-sm font-bold truncate">${entry.safeName}</h4>
                    <p class="hots-list-item__meta truncate mt-0.5">${entry.safeRole}</p>
                </div>
                <span class="hots-tier-btn is-active shrink-0" data-tier="${entry.safeTier}">
                    ${entry.safeTier} Tier
                </span>
            </div>
        `;

        const img = btn.querySelector('img');
        if (img) {
            applyHeroSidebarPortraitFallback(img, fallbackPortrait);
            img.src = entry.portraitUrl;
        }

        createdButtons.push(btn);
        frag.appendChild(btn);
    });

    list.replaceChildren(frag);
    lastRenderedOrderKey = orderKey;
    lastRenderedActiveKey = activeKey;

    syncHeroListObserverTargets(list, createdButtons, { resetAll: true });

    const countEl = document.getElementById('hero-count');
    if (countEl) {
        countEl.textContent = `${sortedEntries.length} Heroes`;
    }

    bindSidebarHeightSync();
    scheduleSidebarHeightSync();
}

function renderHeroSidebar(heroes) {
    const { sortedEntries, byKey } = getPreparedHeroRoster(heroes);
    renderPreparedHeroSidebar(sortedEntries, byKey);
}

function filterHeroes() {
    bindHeroSidebarEvents();
    clearTimeout(heroSearchDebounceTimer);
    heroSearchDebounceTimer = null;
    clearTimeout(heroSearchPreloadTimer);
    heroSearchPreloadTimer = null;

    const rawQuery = (document.getElementById('hero-search')?.value || '').trim();
    const qLower = rawQuery.toLowerCase();
    const qNorm = toNormalizedHeroKey(rawQuery);
    const roster = typeof MASTER_HERO_LIST !== 'undefined' && Array.isArray(MASTER_HERO_LIST)
        ? MASTER_HERO_LIST
        : [];

    const { sortedEntries, byKey } = getPreparedHeroRoster(roster);
    const catalog = getCatalogApi();

    let matchedEntries = sortedEntries;
    if (rawQuery) {
        if (catalog && typeof catalog.searchHeroes === 'function' && heroIndexCache.sourceRef === roster) {
            const searchHits = catalog.searchHeroes({ query: rawQuery });
            const allowedKeys = new Set(
                searchHits.flatMap(hit => [
                    toNormalizedHeroKey(hit.id),
                    toNormalizedHeroKey(hit.name),
                    ...(Array.isArray(hit.aliases) ? hit.aliases.map(toNormalizedHeroKey) : [])
                ]).filter(Boolean)
            );
            matchedEntries = sortedEntries.filter(
                entry => entry.aliasKeys.has(toNormalizedHeroKey(rawQuery))
                    || Array.from(entry.aliasKeys).some(k => allowedKeys.has(k))
                    || entry.searchLower.includes(qLower)
            );
        } else {
            matchedEntries = sortedEntries.filter(entry => {
                if (entry.searchLower.includes(qLower)) return true;
                if (!qNorm) return false;
                return entry.searchNorm.includes(qNorm) || entry.primaryKey.includes(qNorm);
            });
        }
    }

    renderPreparedHeroSidebar(matchedEntries, byKey);

    if (rawQuery) {
        heroSearchPreloadTimer = setTimeout(() => warmSearchMatches(matchedEntries), HERO_SEARCH_PRELOAD_DELAY_MS);
    }
}

function scheduleDebouncedHeroFilter() {
    clearTimeout(heroSearchDebounceTimer);
    heroSearchDebounceTimer = setTimeout(() => {
        heroSearchDebounceTimer = null;
        filterHeroes();
    }, HERO_SEARCH_DEBOUNCE_MS);
}

function bindHeroSidebarEvents() {
    const searchInput = document.getElementById('hero-search');
    if (searchInput && searchInput.dataset.heroSearchBound !== 'true') {
        searchInput.dataset.heroSearchBound = 'true';
        searchInput.addEventListener('input', scheduleDebouncedHeroFilter);
    }
}

function initializeHeroSidebar(heroes = MASTER_HERO_LIST) {
    bindHeroSidebarEvents();
    renderHeroSidebar(heroes);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHeroSidebarEvents, { once: true });
} else {
    bindHeroSidebarEvents();
}