// ==========================================
// 1. HERO SIDEBAR, SEARCH & LAZY PRELOADING
// ==========================================

const HERO_SCROLL_SETTLE_DELAY_MS = 180;
const HERO_SEARCH_PRELOAD_DELAY_MS = 75;
const HERO_FALLBACK_PORTRAIT = 'https://via.placeholder.com/110?text=Hero';

const PRELOADED_HERO_KEYS = new Set();
const PENDING_VISIBLE_HERO_IDS = new Set();

let heroSearchPreloadTimer = null;
let heroListObserver = null;
let heroScrollIdleTimer = null;
let isHeroListScrolling = false;
let sidebarHeightResizeObserver = null;

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

function sortHeroesByDisplayName(heroes) {
    return [...(Array.isArray(heroes) ? heroes : [])].sort((a, b) => {
        const nameA = getHeroDisplayName(a);
        const nameB = getHeroDisplayName(b);
        const byName = nameA.localeCompare(nameB, undefined, {
            sensitivity: 'base',
            numeric: true
        });
        if (byName !== 0) return byName;

        return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, {
            sensitivity: 'base',
            numeric: true
        });
    });
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
        const key = String(id).toLowerCase();
        if (PRELOADED_HERO_KEYS.has(key)) continue;

        const raw = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(id) : null;
        if (!raw) continue;

        PRELOADED_HERO_KEYS.add(key);
        rawEntries.push(raw);

        if (typeof getNormalizedHeroData === 'function') {
            getNormalizedHeroData(id);
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

function observeVisibleHeroButtons(listEl) {
    if (!listEl || typeof IntersectionObserver === 'undefined') return;

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

                    const key = String(heroId).toLowerCase();
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
    } else {
        heroListObserver.disconnect();
    }

    cancelPendingVisibleHeroPreload();
    listEl.querySelectorAll('[data-hero-id]').forEach(btn => {
        heroListObserver.observe(btn);
    });
}

function navigateFromSidebar(heroId, isBuilderView) {
    if (!heroId || typeof navigateTo !== 'function') return;
    navigateTo(isBuilderView ? 'builder' : 'builds', { hero: heroId });
}

function renderHeroSidebar(heroes) {
    bindHeroSidebarEvents();

    const list = document.getElementById('hero-list');
    if (!list) return;

    const sortedHeroes = sortHeroesByDisplayName(heroes);
    const isBuilder = !document.getElementById('view-builder')?.classList.contains('hidden');
    const activeId = isBuilder ? builderHeroId : currentSelectedHeroId;
    const fallbackPortrait = typeof HERO_VIEW_ICON_FALLBACK === 'string'
        ? HERO_VIEW_ICON_FALLBACK
        : HERO_FALLBACK_PORTRAIT;
    const frag = document.createDocumentFragment();

    sortedHeroes.forEach(h => {
        if (!h || typeof h !== 'object') return;

        const isSelected = activeId === h.id;
        const tier = String(typeof getHeroTier === 'function' ? getHeroTier(h.id) : 'D').toUpperCase();
        const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(h.id) : null;
        const portraitUrl = typeof resolveAssetUrl === 'function'
            ? resolveAssetUrl(h.portrait || rawEntry, fallbackPortrait)
            : fallbackPortrait;

        const displayName = getHeroDisplayName(h) || 'Hero';
        const safeName = escapeSidebarHtml(displayName);
        const safeRole = escapeSidebarHtml(h.role || 'Nexus Combatant');
        const safeTier = escapeSidebarHtml(tier);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.heroId = h.id;
        btn.className = `hots-list-item hots-list-item--hero${isSelected ? ' is-selected' : ''}`;
        if (isSelected) {
            btn.setAttribute('aria-current', 'true');
        }

        btn.addEventListener('click', () => navigateFromSidebar(h.id, isBuilder));

        btn.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="hex-sidebar-frame">
                    <img alt="${safeName}" class="hex-sidebar-img" loading="lazy">
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
                    <h4 class="hots-list-item__title text-sm font-bold truncate">${safeName}</h4>
                    <p class="hots-list-item__meta truncate mt-0.5">${safeRole}</p>
                </div>
                <span class="hots-tier-btn is-active shrink-0" data-tier="${safeTier}">
                    ${safeTier} Tier
                </span>
            </div>
        `;

        const img = btn.querySelector('img');
        if (img) {
            img.addEventListener('error', () => {
                if (img.src !== fallbackPortrait) {
                    img.src = fallbackPortrait;
                }
            }, { once: true });
            img.src = portraitUrl;
        }

        frag.appendChild(btn);
    });

    list.replaceChildren(frag);
    observeVisibleHeroButtons(list);

    const countEl = document.getElementById('hero-count');
    if (countEl) {
        countEl.innerText = `${sortedHeroes.length} Heroes`;
    }

    bindSidebarHeightSync();
    requestAnimationFrame(syncSidebarHeightToContent);
}

function filterHeroes() {
    bindHeroSidebarEvents();
    clearTimeout(heroSearchPreloadTimer);
    heroSearchPreloadTimer = null;

    const q = (document.getElementById('hero-search')?.value || '').trim().toLowerCase();
    const matches = q
        ? MASTER_HERO_LIST.filter(h => String(h.searchText || `${h.name || ''} ${h.id || ''}`).toLowerCase().includes(q))
        : MASTER_HERO_LIST;

    const sortedMatches = sortHeroesByDisplayName(matches);
    renderHeroSidebar(sortedMatches);

    if (q) {
        heroSearchPreloadTimer = setTimeout(() => warmSearchMatches(sortedMatches), HERO_SEARCH_PRELOAD_DELAY_MS);
    }
}

function bindHeroSidebarEvents() {
    const searchInput = document.getElementById('hero-search');
    if (searchInput && searchInput.dataset.heroSearchBound !== 'true') {
        searchInput.dataset.heroSearchBound = 'true';
        searchInput.addEventListener('input', filterHeroes);
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
