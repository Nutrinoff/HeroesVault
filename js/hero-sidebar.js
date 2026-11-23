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
let lastRenderedOrderKey = null;
let lastRenderedActiveKey = null;

let heroIndexCache = {
    sourceRef: null,
    sourceLen: -1,
    sortedEntries: [],
    byKey: new Map()
};

function toNormalizedHeroKey(value) {
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

function buildHeroSidebarEntry(hero, fallbackPortrait) {
    const normHero = typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(hero.id) : null;
    const resolvedId = String(normHero?.id || hero.id || '').trim();
    const primaryKey = toNormalizedHeroKey(resolvedId || hero.id);
    const aliasKeys = new Set(
        [hero.id, hero.name, resolvedId, normHero?.name]
            .map(toNormalizedHeroKey)
            .filter(Boolean)
    );

    const displayName = getHeroDisplayName(normHero || hero) || 'Hero';
    const role = normHero?.role || hero.role || 'Nexus Combatant';
    const tier = String(typeof getHeroTier === 'function' ? getHeroTier(resolvedId) : 'D').toUpperCase();
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(resolvedId) : null;
    const portraitUrl = typeof resolveAssetUrl === 'function'
        ? resolveAssetUrl(normHero?.portrait || hero.portrait || rawEntry, fallbackPortrait)
        : fallbackPortrait;

    const searchLower = [
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

    const searchNorm = toNormalizedHeroKey(searchLower);

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

    if (
        heroIndexCache.sourceRef === list &&
        heroIndexCache.sourceLen === list.length &&
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

    heroIndexCache = {
        sourceRef: list,
        sourceLen: list.length,
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

function syncSidebarHeightToContent() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (!isDesktop || sidebar.classList.contains('hidden')) {
        sidebar.style.height = '';
        return;
    }

    const targetEl = getSidebarTargetBottomEl();
    if (!targetEl) {
        sidebar.style.height = '';
        return;
    }

    const sidebarRect = sidebar.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const matchedHeight = Math.round(targetRect.bottom - sidebarRect.top);

    sidebar.style.height = matchedHeight > 200 ? `${matchedHeight}px` : '';
}

function bindSidebarHeightSync() {
    if (window._hotsSidebarHeightBound) return;
    window._hotsSidebarHeightBound = true;

    window.addEventListener('resize', () => {
        requestAnimationFrame(syncSidebarHeightToContent);
    }, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
        sidebarHeightResizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(syncSidebarHeightToContent);
        });

        ['view-builder', 'view-builds'].forEach(id => {
            const el = document.getElementById(id);
            if (el) sidebarHeightResizeObserver.observe(el);
        });
    }
}

function preloadHeroIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const rawEntries = [];
    for (const id of ids) {
        if (!id) continue;
        const normInfo = typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(id) : null;
        const canonicalKey = toNormalizedHeroKey(normInfo?.id || id);
        if (!canonicalKey || PRELOADED_HERO_KEYS.has(canonicalKey)) continue;

        const raw = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(normInfo?.id || id) : null;
        if (!raw && !normInfo) continue;

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
    preloadHeroIds(matches.slice(0, 3).map(m => m.id));
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

function syncHeroListObserverTargets(listEl, { resetAll = false } = {}) {
    const observer = ensureHeroListObserver(listEl);
    if (!observer) return;

    if (resetAll) {
        observer.disconnect();
        observedHeroElements = new WeakSet();
        cancelPendingVisibleHeroPreload();
    }

    listEl.querySelectorAll('[data-hero-id]').forEach(btn => {
        if (!observedHeroElements.has(btn)) {
            observedHeroElements.add(btn);
            observer.observe(btn);
        }
    });
}

function navigateFromSidebar(heroId, isBuilderView) {
    if (!heroId || typeof navigateTo !== 'function') return;
    navigateTo(isBuilderView ? 'builder' : 'builds', { hero: heroId });
}

function applyHeroSidebarPortraitFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
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
    listEl.querySelectorAll('button[data-hero-id]').forEach(btn => {
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
    });
}

function renderHeroSidebar(heroes) {
    bindHeroSidebarEvents();

    const list = document.getElementById('hero-list');
    if (!list) return;

    const { sortedEntries, byKey } = getPreparedHeroRoster(heroes);
    const isBuilder = !document.getElementById('view-builder')?.classList.contains('hidden');
    const activeId = isBuilder ? builderHeroId : currentSelectedHeroId;
    const activeEntry = activeId ? byKey.get(toNormalizedHeroKey(activeId)) : null;
    const activeKey = activeEntry?.primaryKey || toNormalizedHeroKey(activeId);

    const orderKey = sortedEntries.map(e => e.resolvedId).join('|');
    const hasSameStructure =
        list.children.length === sortedEntries.length &&
        list.children.length > 0 &&
        lastRenderedOrderKey === orderKey;

    if (hasSameStructure) {
        if (lastRenderedActiveKey !== activeKey) {
            syncSidebarSelectionInDom(list, activeKey, isBuilder);
            lastRenderedActiveKey = activeKey;
        }
        syncHeroListObserverTargets(list, { resetAll: false });
        bindSidebarHeightSync();
        requestAnimationFrame(syncSidebarHeightToContent);
        return;
    }

    const fallbackPortrait = getSidebarFallbackPortrait();
    const frag = document.createDocumentFragment();

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

        frag.appendChild(btn);
    });

    list.replaceChildren(frag);
    lastRenderedOrderKey = orderKey;
    lastRenderedActiveKey = activeKey;

    syncHeroListObserverTargets(list, { resetAll: true });

    const countEl = document.getElementById('hero-count');
    if (countEl) {
        countEl.innerText = `${sortedEntries.length} Heroes`;
    }

    bindSidebarHeightSync();
    requestAnimationFrame(syncSidebarHeightToContent);
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

    const { sortedEntries } = getPreparedHeroRoster(roster);

    const matchedEntries = rawQuery
        ? sortedEntries.filter(entry => {
            if (entry.searchLower.includes(qLower)) return true;
            if (!qNorm) return false;
            return entry.searchNorm.includes(qNorm) || entry.primaryKey.includes(qNorm);
        })
        : sortedEntries;

    const sortedMatches = matchedEntries.map(entry => entry.hero);
    renderHeroSidebar(sortedMatches);

    if (rawQuery) {
        heroSearchPreloadTimer = setTimeout(() => warmSearchMatches(sortedMatches), HERO_SEARCH_PRELOAD_DELAY_MS);
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
