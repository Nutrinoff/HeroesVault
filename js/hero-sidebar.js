// ==========================================
// 1. HERO SIDEBAR, SEARCH & LAZY PRELOADING
// ==========================================

const HERO_SCROLL_SETTLE_DELAY_MS = 180;
const HERO_FALLBACK_PORTRAIT = 'https://via.placeholder.com/110?text=Hero';

const PRELOADED_HERO_KEYS = new Set();
const PENDING_VISIBLE_HERO_IDS = new Set();

let heroSearchPreloadTimer = null;
let heroListObserver = null;
let heroScrollIdleTimer = null;
let isHeroListScrolling = false;

function resolveHeroUiPortraitPath(rawHero) {
    if (!rawHero) return '';
    if (typeof getHeroPortrait === 'function') {
        const fromHelper = getHeroPortrait(rawHero);
        if (fromHelper) return fromHelper;
    }
    if (typeof rawHero === 'string') return rawHero;
    return rawHero.portrait || rawHero.portraitUrl || rawHero.icon || rawHero.imageUrl || '';
}

function resolveHeroUiPortraitUrl(rawOrPath) {
    const rawPath = typeof rawOrPath === 'object' && rawOrPath !== null
        ? resolveHeroUiPortraitPath(rawOrPath)
        : rawOrPath;

    if (!rawPath) return HERO_FALLBACK_PORTRAIT;
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(rawPath) || HERO_FALLBACK_PORTRAIT;
    }
    return rawPath;
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
        if (heroListObserver && listEl) {
            listEl.querySelectorAll('[data-hero-id]').forEach(btn => {
                heroListObserver.unobserve(btn);
                heroListObserver.observe(btn);
            });
        }
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
                if (isHeroListScrolling) return;

                for (const entry of entries) {
                    if (entry.isIntersecting && entry.target.dataset.heroId) {
                        const id = entry.target.dataset.heroId;
                        if (!PRELOADED_HERO_KEYS.has(String(id).toLowerCase())) {
                            PENDING_VISIBLE_HERO_IDS.add(id);
                        }
                    }
                }

                scheduleVisibleHeroPreloadAfterIdle();
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

function renderHeroSidebar(heroes) {
    const list = document.getElementById('hero-list');
    if (!list) return;

    const isBuilder = !document.getElementById('view-builder')?.classList.contains('hidden');
    const activeId = isBuilder ? builderHeroId : currentSelectedHeroId;
    const frag = document.createDocumentFragment();
    const tierStylesMap = typeof TIER_STYLES !== 'undefined' ? TIER_STYLES : {};

    (heroes || []).forEach(h => {
        const tier = typeof getHeroTier === 'function' ? getHeroTier(h.id) : 'D';
        const s = tierStylesMap[tier] || tierStylesMap.D || {
            bg: 'bg-slate-800/80',
            text: 'text-slate-200',
            border: 'border-slate-600'
        };
        const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(h.id) : null;
        const portraitUrl = resolveHeroUiPortraitUrl(h.portrait || rawEntry);
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.dataset.heroId = h.id;
        btn.className = `w-full text-left p-2.5 rounded-xl border transition-all ${
            activeId === h.id
                ? 'bg-cyan-400/15 border-cyan-400/70'
                : 'border-[#2e1866] bg-[#090417]/50 hover:bg-[#1c0e40]/80'
        }`;

        btn.addEventListener('click', () => {
            if (isBuilder && typeof openBuilder === 'function') {
                openBuilder(h.id, null, true);
            } else if (typeof navigateTo === 'function') {
                navigateTo('builds', { hero: h.id });
            } else {
                selectHero(h.id, false);
            }
        });

        btn.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="hex-sidebar-frame">
                    <img src="${portraitUrl}" onerror="this.onerror=null;this.src='${HERO_FALLBACK_PORTRAIT}'" alt="${h.name}" class="hex-sidebar-img" loading="lazy">
                    <svg class="hex-sidebar-ring" viewBox="0 0 100 100" aria-hidden="true">
                        <polygon
                            points="50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2"
                            fill="none"
                            stroke="rgba(41, 197, 255, 0.85)"
                            stroke-width="4.5"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-bold truncate text-white">${h.name}</h4>
                    <p class="text-xs text-violet-200/75 truncate">${h.role || 'Nexus Combatant'}</p>
                </div>
                <span class="text-[10px] font-mono font-bold px-2 py-1 rounded-sm border ${s.bg} ${s.text} ${s.border}">
                    ${tier} Tier
                </span>
            </div>
        `;

        frag.appendChild(btn);
    });

    list.replaceChildren(frag);
    observeVisibleHeroButtons(list);

    const countEl = document.getElementById('hero-count');
    if (countEl) {
        countEl.innerText = `${(heroes || []).length} Heroes`;
    }
}

function filterHeroes() {
    const q = (document.getElementById('hero-search')?.value || '').trim().toLowerCase();
    const matches = q
        ? MASTER_HERO_LIST.filter(h => String(h.searchText || `${h.name || ''} ${h.id || ''}`).toLowerCase().includes(q))
        : MASTER_HERO_LIST;

    renderHeroSidebar(matches);

    clearTimeout(heroSearchPreloadTimer);
    if (q) {
        heroSearchPreloadTimer = setTimeout(() => warmSearchMatches(matches), 75);
    }
}
