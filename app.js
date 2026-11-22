// ==========================================
// 1. GLOBAL STATE & CONFIGURATIONS
// ==========================================

let MASTER_HERO_LIST = [];
let MASTER_MAP_LIST = [];
let PERSONAL_BUILDS = [];
let MASTER_TIERS = {};
let HOTS_MASTER_DATA = {};

let currentSelectedHeroId = null;
let currentHeroData = null;
let currentBuildIndex = 0;
let builderHeroId = null;
let builderHeroData = null;
let builderSelectedTalents = [1, 1, 1, 1, 1, 1, 1];

const HERO_DATA_CACHE = new Map();
const PRELOADED_HERO_KEYS = new Set();
const pendingVisibleHeroIds = new Set();

let heroSearchPreloadTimer = null;
let heroListObserver = null;
let heroScrollIdleTimer = null;
let isHeroListScrolling = false;

const TALENT_TIERS = ['1', '4', '7', '10', '13', '16', '20'];
const TOOLTIP_CURSOR_GAP = 16;
const TOOLTIP_VIEWPORT_MARGIN = 8;
const SCROLL_SETTLE_DELAY_MS = 180;
const FALLBACK_HERO_PORTRAIT = 'https://via.placeholder.com/110?text=Hero';


// ==========================================
// 2. PORTRAIT & ASSET HELPERS
// ==========================================

function resolvePortraitPath(rawHero) {
    if (!rawHero) return '';
    if (typeof getHeroPortrait === 'function') {
        const fromHelper = getHeroPortrait(rawHero);
        if (fromHelper) return fromHelper;
    }
    if (typeof rawHero === 'string') return rawHero;
    return rawHero.portrait || rawHero.portraitUrl || rawHero.icon || rawHero.imageUrl || '';
}

function resolvePortraitUrl(rawOrPath) {
    const rawPath = typeof rawOrPath === 'object' && rawOrPath !== null
        ? resolvePortraitPath(rawOrPath)
        : rawOrPath;

    if (!rawPath) return FALLBACK_HERO_PORTRAIT;
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(rawPath) || FALLBACK_HERO_PORTRAIT;
    }
    return rawPath;
}


// ==========================================
// 3. INITIALIZATION & ROUTING
// ==========================================

function syncHomeSummaryCounts() {
    const heroCountEl = document.getElementById('home-hero-count');
    const buildCountEl = document.getElementById('home-build-count');
    const guideCountEl = document.getElementById('home-guide-count');

    if (heroCountEl) {
        heroCountEl.textContent = `${MASTER_HERO_LIST.length} Heroes`;
    }
    if (buildCountEl) {
        buildCountEl.textContent = `${PERSONAL_BUILDS.length} Sets`;
    }
    if (guideCountEl && typeof getAcademyArticlesList === 'function') {
        guideCountEl.textContent = `${getAcademyArticlesList().length} Guides`;
    }
}

function clearPatchQueryParamsFromUrl() {
    if (typeof window.history?.replaceState !== 'function') return;
    try {
        const url = new URL(window.location.href);
        let changed = false;
        for (const key of ['view', 'patch', 'patchId', 'feed']) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        }
        if (changed) {
            window.history.replaceState(window.history.state, '', url.toString());
        }
    } catch (_) {
        // Ignore URL errors on restricted origins
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [mr, br, mapr, tr] = await Promise.all([
            fetch('./data/heroes-master.json'),
            fetch('./data/builds.json'),
            fetch('./data/maps.json'),
            fetch('./data/tiers.json')
        ].map(p => p.catch(() => null)));

        if (mr?.ok) {
            const d = await mr.json();
            HOTS_MASTER_DATA = d.items || d;

            const rawHeroes = Array.isArray(HOTS_MASTER_DATA)
                ? HOTS_MASTER_DATA
                : Object.values(HOTS_MASTER_DATA);

            MASTER_HERO_LIST = rawHeroes.map(h => {
                const id = h.id || h.hyperlinkId || h.attributeId;
                return {
                    id,
                    name: h.name || 'Unknown Hero',
                    title: h.title || 'Nexus Combatant',
                    role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
                    portrait: resolvePortraitPath(h),
                    searchText: `${h.name || ''} ${id || ''}`.toLowerCase()
                };
            });

            if (typeof preloadAllAssets === 'function') {
                preloadAllAssets(rawHeroes);
            }
        }

        if (br?.ok) PERSONAL_BUILDS = await br.json();
        if (mapr?.ok) {
            MASTER_MAP_LIST = await mapr.json();
            if (typeof populateMapsDropdown === 'function') {
                populateMapsDropdown();
            }
        }
        if (tr?.ok) MASTER_TIERS = await tr.json();

        renderHeroSidebar(MASTER_HERO_LIST);
        renderTierList();
        syncHomeSummaryCounts();

        if (typeof loadAndRenderRotation === 'function') {
            loadAndRenderRotation();
        }

        if (typeof initPatchFilterControls === 'function') {
            initPatchFilterControls();
        }

        handleRoute();

        if (window.lucide) {
            lucide.createIcons();
        }

        window.addEventListener('popstate', handleRoute);

        document.addEventListener('click', e => {
            if (!e.target.closest('#maps-dropdown-menu') && !e.target.closest('#maps-dropdown-toggle')) {
                document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
            }
        });
    } catch (e) {
        console.error('Failed loading data files:', e);
    }
});

function navigateTo(tab, params = {}, push = true) {
    let hashTarget = '#' + tab;
    const q = new URLSearchParams();

    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
            q.set(k, v);
        }
    });

    const queryString = q.toString();
    if (queryString) hashTarget += '?' + queryString;

    let finalUrl = hashTarget;
    try {
        const currentUrl = new URL(window.location.href);
        for (const key of ['view', 'patch', 'patchId', 'feed']) {
            currentUrl.searchParams.delete(key);
        }
        currentUrl.hash = hashTarget;
        finalUrl = currentUrl.toString();
    } catch (_) {
        finalUrl = hashTarget;
    }

    if (push) {
        history.pushState({ tab, params }, '', finalUrl);
    } else {
        history.replaceState({ tab, params }, '', finalUrl);
    }

    handleRoute();
}

function handleRoute() {
    const [tpart, query = ''] = location.hash.replace(/^#/, '').split('?');
    const tab = tpart || 'home';
    const q = new URLSearchParams(query);

    if (tab !== 'patchnotes') {
        clearPatchQueryParamsFromUrl();
    }

    switchTabUI(tab);

    if (tab === 'builds' || tab === 'heroes') {
        selectHero(q.get('hero') || MASTER_HERO_LIST[0]?.id, false);
    } else if (tab === 'map') {
        if (typeof selectMap === 'function') {
            selectMap(q.get('id') || 'alteracpass', false);
        }
    } else if (tab === 'builder') {
        openBuilder(
            q.get('hero') || MASTER_HERO_LIST[0]?.id,
            q.get('build') ? q.get('build').split('').map(Number) : null,
            false
        );
    } else if (tab === 'academy') {
        if (typeof renderAcademy === 'function') {
            renderAcademy();
        }
    } else if (tab === 'patchnotes') {
        if (q.get('patch') && typeof PENDING_DEEP_LINK_PATCH !== 'undefined') {
            PENDING_DEEP_LINK_PATCH = {
                patchId: q.get('patch'),
                feed: q.get('feed') || null,
                openView: true
            };
        }
        if (typeof initPatchFilterControls === 'function') {
            initPatchFilterControls();
        }
        if (typeof loadLivePatchNotes === 'function') {
            loadLivePatchNotes();
        }
        if (typeof schedulePatchSidebarSync === 'function') {
            schedulePatchSidebarSync();
        }
    }
}

function switchTabUI(t) {
    const activeTab = t === 'heroes' ? 'builds' : t;

    const viewStates = {
        'view-home': activeTab === 'home',
        'view-builds': activeTab === 'builds',
        'view-map': activeTab === 'map',
        'view-builder': activeTab === 'builder',
        'view-academy': activeTab === 'academy',
        'view-patchnotes': activeTab === 'patchnotes',
        'view-tierlist': activeTab === 'tierlist'
    };

    Object.entries(viewStates).forEach(([id, on]) => {
        document.getElementById(id)?.classList.toggle('hidden', !on);
    });

    document.getElementById('sidebar-container')?.classList.toggle(
        'hidden',
        activeTab !== 'builds' && activeTab !== 'builder'
    );

    const navStates = {
        'nav-home': activeTab === 'home',
        'nav-builds': activeTab === 'builds',
        'nav-builder': activeTab === 'builder',
        'nav-academy': activeTab === 'academy',
        'nav-patchnotes': activeTab === 'patchnotes',
        'nav-tierlist': activeTab === 'tierlist'
    };

    Object.entries(navStates).forEach(([id, on]) => {
        document.getElementById(id)?.classList.toggle('nav-active', on);
    });

    if (activeTab === 'academy' && typeof renderAcademy === 'function') {
        renderAcademy();
    }

    if (activeTab === 'patchnotes' && typeof schedulePatchSidebarSync === 'function') {
        schedulePatchSidebarSync();
    }
}


// ==========================================
// 4. SIDEBAR, SEARCH & IDLE/SEARCH PRELOAD
// ==========================================

function getRawHeroEntry(heroId) {
    if (!heroId) return null;
    if (typeof resolveHeroMasterData === 'function') {
        return resolveHeroMasterData(heroId);
    }
    if (Array.isArray(HOTS_MASTER_DATA)) {
        return HOTS_MASTER_DATA.find(h => (h?.id || h?.hyperlinkId || h?.attributeId) === heroId) || null;
    }
    return HOTS_MASTER_DATA?.[heroId] || null;
}

function preloadHeroIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const rawEntries = [];
    for (const id of ids) {
        if (!id) continue;
        const key = String(id).toLowerCase();
        if (PRELOADED_HERO_KEYS.has(key)) continue;

        const raw = getRawHeroEntry(id);
        if (!raw) continue;

        PRELOADED_HERO_KEYS.add(key);
        rawEntries.push(raw);
        getNormalizedHeroData(id);
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
    pendingVisibleHeroIds.clear();
}

function flushVisibleHeroPreload() {
    heroScrollIdleTimer = null;
    if (isHeroListScrolling || pendingVisibleHeroIds.size === 0) return;

    const ids = Array.from(pendingVisibleHeroIds);
    pendingVisibleHeroIds.clear();
    preloadHeroIds(ids);
}

function scheduleVisibleHeroPreloadAfterIdle() {
    if (isHeroListScrolling || pendingVisibleHeroIds.size === 0) return;
    clearTimeout(heroScrollIdleTimer);
    heroScrollIdleTimer = setTimeout(flushVisibleHeroPreload, SCROLL_SETTLE_DELAY_MS);
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
    }, SCROLL_SETTLE_DELAY_MS);
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
                            pendingVisibleHeroIds.add(id);
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

    heroes.forEach(h => {
        const tier = getHeroTier(h.id);
        const s = TIER_STYLES[tier] || TIER_STYLES.D;
        const portraitUrl = resolvePortraitUrl(h.portrait || getRawHeroEntry(h.id));
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.dataset.heroId = h.id;
        btn.className = `w-full text-left p-2.5 rounded-xl border transition-all ${
            activeId === h.id
                ? 'bg-cyan-400/15 border-cyan-400/70'
                : 'border-[#2e1866] bg-[#090417]/50 hover:bg-[#1c0e40]/80'
        }`;

        btn.addEventListener('click', () => {
            if (isBuilder) {
                openBuilder(h.id, null, true);
            } else {
                navigateTo('builds', { hero: h.id });
            }
        });

        btn.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="hex-sidebar-frame">
                    <img src="${portraitUrl}" onerror="this.onerror=null;this.src='${FALLBACK_HERO_PORTRAIT}'" alt="${h.name}" class="hex-sidebar-img" loading="lazy">
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
        countEl.innerText = `${heroes.length} Heroes`;
    }
}

function filterHeroes() {
    const q = (document.getElementById('hero-search')?.value || '').trim().toLowerCase();
    const matches = q
        ? MASTER_HERO_LIST.filter(h => h.searchText.includes(q))
        : MASTER_HERO_LIST;

    renderHeroSidebar(matches);

    clearTimeout(heroSearchPreloadTimer);
    if (q) {
        heroSearchPreloadTimer = setTimeout(() => warmSearchMatches(matches), 75);
    }
}


// ==========================================
// 5. UNIFIED HERO DATA & HEADER RENDERERS
// ==========================================

function getNormalizedHeroData(id) {
    if (!id) return null;
    if (HERO_DATA_CACHE.has(id)) return HERO_DATA_CACHE.get(id);

    const h = getRawHeroEntry(id);
    if (!h) return null;

    const normalized = {
        id,
        name: h.name || id,
        title: h.title || 'Nexus Combatant',
        role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
        portrait: resolvePortraitPath(h),
        abilities: typeof flattenHeroAbilities === 'function' ? flattenHeroAbilities(h) : [],
        talents: typeof normalizeTalentTree === 'function' ? normalizeTalentTree(h.talents || h.talentTree || {}) : {}
    };

    HERO_DATA_CACHE.set(id, normalized);
    return normalized;
}

function renderAbilityStrip(abilitiesList, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;

    const list = (abilitiesList || []).filter(a => {
        const keyUpper = String(a.key || '').toUpperCase();
        const nameLower = String(a.name || '').toLowerCase();
        const catLower = String(a.category || '').toLowerCase();

        if (['HEROIC', 'R', 'B'].includes(keyUpper) || catLower === 'hearth' || nameLower === 'hearth') {
            return false;
        }

        if (keyUpper === 'Z' || catLower === 'mount' || nameLower.includes('mount')) {
            const isCustomZ = nameLower.includes('tunnel') || nameLower.includes('flight') || nameLower.includes('burrow');
            if (!isCustomZ && (nameLower.includes('summon mount') || nameLower === 'mount' || catLower === 'mount')) {
                return false;
            }
        }

        return true;
    });

    if (!list.length) {
        box.innerHTML = '<span class="text-xs text-violet-300/60">No abilities configured</span>';
        return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(a => {
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center gap-1 bg-[#090417]/80 border border-[#371e78] rounded p-1.5 min-w-12';
        el.addEventListener('mouseenter', e => showAbilityTooltip(e, a));
        el.addEventListener('mouseleave', hideTooltip);
        el.innerHTML = `
            <img src="${resolvePortraitUrl(a.icon)}" onerror="this.onerror=null;this.src='https://via.placeholder.com/32?text=?'" class="w-8 h-8 rounded-sm border border-[#4a2b9c] object-cover">
            <span class="text-[10px] font-mono font-bold text-cyan-300">${a.key || 'Z'}</span>
            ${a.variant ? `<span class="text-[8px] text-violet-200/75 max-w-16 truncate" title="${a.variant}">${a.variant}</span>` : ''}
        `;
        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function renderHeroHeader(heroData) {
    if (!heroData) return;
    const portraitUrl = resolvePortraitUrl(heroData.portrait || getRawHeroEntry(heroData.id));

    const portraitEl = document.getElementById('hero-portrait');
    const nameEl = document.getElementById('hero-name');
    const roleEl = document.getElementById('hero-role');
    const titleEl = document.getElementById('hero-title');

    if (portraitEl) {
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = FALLBACK_HERO_PORTRAIT;
        };
        portraitEl.src = portraitUrl;
        portraitEl.alt = `${heroData.name} portrait`;
    }
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;

    renderAbilityStrip(heroData.abilities, 'hero-abilities');
}

function renderBuilderHeader(heroData) {
    if (!heroData) return;
    const portraitUrl = resolvePortraitUrl(heroData.portrait || getRawHeroEntry(heroData.id));

    const portraitEl = document.getElementById('builder-portrait');
    const nameEl = document.getElementById('builder-name');
    const roleEl = document.getElementById('builder-role');
    const titleEl = document.getElementById('builder-title');
    const bgModel = document.getElementById('builder-model-bg');

    if (portraitEl) {
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = FALLBACK_HERO_PORTRAIT;
        };
        portraitEl.src = portraitUrl;
        portraitEl.alt = `${heroData.name} portrait`;
    }
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;
    if (bgModel) bgModel.src = portraitUrl;

    renderAbilityStrip(heroData.abilities, 'builder-abilities');
}


// ==========================================
// 6. HERO DETAILS & BUILDS VIEW
// ==========================================

async function selectHero(id, update = true) {
    if (!id) return;

    currentSelectedHeroId = id;
    currentBuildIndex = 0;
    switchTabUI('builds');

    if (update) {
        navigateTo('builds', { hero: id });
    }

    filterHeroes();

    const heroData = getNormalizedHeroData(id);
    if (!heroData) {
        console.error('Missing hero master entry', id);
        return;
    }

    currentHeroData = heroData;
    renderHeroHeader(currentHeroData);
    renderActiveBuild();
}

function renderActiveBuild() {
    const h = currentHeroData;
    if (!h) return;

    const d = PERSONAL_BUILDS.find(x => normalizeHeroKey(x.heroId) === normalizeHeroKey(h.id));
    const tabs = document.getElementById('build-tabs');
    const notes = document.getElementById('detail-notes');
    if (!tabs || !notes) return;

    if (!d?.builds?.length) {
        tabs.innerHTML = '';
        notes.innerText = 'No notes added for this hero yet.';
        renderBuildStrip(h, null);
        return;
    }

    const frag = document.createDocumentFragment();
    d.builds.forEach((v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider border cursor-pointer ${
            i === currentBuildIndex
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/55'
                : 'bg-[#090417] text-violet-200/75 border-[#321a6e] hover:border-cyan-400/50'
        }`;
        b.innerText = `Build ${i + 1}: ${v.buildName || 'Unnamed'}`;
        b.addEventListener('click', () => {
            currentBuildIndex = i;
            renderActiveBuild();
        });
        frag.appendChild(b);
    });

    tabs.replaceChildren(frag);

    const v = d.builds[currentBuildIndex] || d.builds[0];
    notes.innerHTML = v.notes || 'No notes added yet.';
    renderBuildStrip(h, v.buildCode);
}

function renderBuildStrip(h, code) {
    const box = document.getElementById('build-strip');
    if (!box) return;

    const p = typeof decodeBuildCode === 'function' ? decodeBuildCode(code) : [1, 1, 1, 1, 1, 1, 1];
    const frag = document.createDocumentFragment();

    TALENT_TIERS.forEach((l, i) => {
        const t = h.talents?.[l]?.[p[i] - 1] || h.talents?.[l]?.[0];
        const el = document.createElement('div');

        el.className = 'hots-subpanel rounded p-2 flex flex-col items-center gap-2 transition-all hover:border-cyan-400/60';

        if (t) {
            el.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            el.addEventListener('mouseleave', hideTooltip);

            el.innerHTML = `
                <img src="${resolvePortraitUrl(t.icon)}" onerror="this.onerror=null;this.src='https://via.placeholder.com/44?text=?'" class="w-11 h-11 rounded-sm border border-[#4a2b9c] object-cover">
                <span class="text-[10px] font-mono text-cyan-300">Lv ${l}</span>
                <span class="text-[10px] text-center text-slate-100 truncate max-w-20" title="${t.name}">${t.name}</span>
            `;
        } else {
            el.innerHTML = `<span class="text-[10px] text-violet-300/60">Lv ${l} · none</span>`;
        }

        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}


// ==========================================
// 7. TOOLTIPS
// ==========================================

function positionTooltip(clientX, clientY) {
    const tip = document.getElementById('talent-tooltip');
    if (!tip || tip.classList.contains('hidden')) return;

    const { width, height } = tip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let left = clientX + TOOLTIP_CURSOR_GAP;
    if (left + width > viewportWidth - TOOLTIP_VIEWPORT_MARGIN) {
        left = clientX - width - TOOLTIP_CURSOR_GAP;
    }
    left = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(left, viewportWidth - width - TOOLTIP_VIEWPORT_MARGIN));

    let top = clientY + TOOLTIP_CURSOR_GAP;
    if (top + height > viewportHeight - TOOLTIP_VIEWPORT_MARGIN) {
        top = clientY - height - TOOLTIP_VIEWPORT_MARGIN;
    }
    top = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(top, viewportHeight - height - TOOLTIP_VIEWPORT_MARGIN));

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

document.addEventListener('pointermove', e => positionTooltip(e.clientX, e.clientY), { passive: true });

function showAbilityTooltip(e, a) {
    showTooltip(e, a.name, `Ability [${a.key}]${a.variant ? ' · ' + a.variant : ''}`, a.desc, a.icon);
}

function showTalentTooltip(e, t, l) {
    showTooltip(e, t.name, `Level ${l} Talent`, t.fullText || t.shortText || t.description || '', t.icon);
}

function showTooltip(e, name, level, description, icon) {
    const tip = document.getElementById('talent-tooltip');
    if (!tip) return;

    const tipIcon = document.getElementById('tip-icon');
    const tipName = document.getElementById('tip-name');
    const tipLevel = document.getElementById('tip-level');
    const tipDesc = document.getElementById('tip-desc');

    if (tipIcon) tipIcon.src = resolvePortraitUrl(icon);
    if (tipName) tipName.innerText = name || '';
    if (tipLevel) tipLevel.innerText = level;
    if (tipDesc) tipDesc.innerHTML = typeof formatGameText === 'function'
        ? (formatGameText(description) || 'No description available.')
        : (description || 'No description available.');

    tip.classList.remove('hidden');
    positionTooltip(e.clientX, e.clientY);
}

function hideTooltip() {
    document.getElementById('talent-tooltip')?.classList.add('hidden');
}
