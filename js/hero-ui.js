// ==========================================
// 1. HERO SIDEBAR & PRELOADING
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


// ==========================================
// 2. HERO HEADERS, ABILITIES & BUILDS VIEW
// ==========================================

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
        if (typeof showAbilityTooltip === 'function') {
            el.addEventListener('mouseenter', e => showAbilityTooltip(e, a));
        }
        if (typeof hideTooltip === 'function') {
            el.addEventListener('mouseleave', hideTooltip);
        }
        el.innerHTML = `
            <img src="${resolveHeroUiPortraitUrl(a.icon)}" onerror="this.onerror=null;this.src='https://via.placeholder.com/32?text=?'" class="w-8 h-8 rounded-sm border border-[#4a2b9c] object-cover">
            <span class="text-[10px] font-mono font-bold text-cyan-300">${a.key || 'Z'}</span>
            ${a.variant ? `<span class="text-[8px] text-violet-200/75 max-w-16 truncate" title="${a.variant}">${a.variant}</span>` : ''}
        `;
        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function renderHeroHeader(heroData) {
    if (!heroData) return;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const portraitUrl = resolveHeroUiPortraitUrl(heroData.portrait || rawEntry);

    const portraitEl = document.getElementById('hero-portrait');
    const nameEl = document.getElementById('hero-name');
    const roleEl = document.getElementById('hero-role');
    const titleEl = document.getElementById('hero-title');

    if (portraitEl) {
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = HERO_FALLBACK_PORTRAIT;
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
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const portraitUrl = resolveHeroUiPortraitUrl(heroData.portrait || rawEntry);

    const portraitEl = document.getElementById('builder-portrait');
    const nameEl = document.getElementById('builder-name');
    const roleEl = document.getElementById('builder-role');
    const titleEl = document.getElementById('builder-title');
    const bgModel = document.getElementById('builder-model-bg');

    if (portraitEl) {
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = HERO_FALLBACK_PORTRAIT;
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

function renderBuildStrip(h, code) {
    const box = document.getElementById('build-strip');
    if (!box) return;

    const p = typeof decodeBuildCode === 'function' ? decodeBuildCode(code) : [1, 1, 1, 1, 1, 1, 1];
    const tiers = typeof TALENT_TIERS !== 'undefined' ? TALENT_TIERS : ['1', '4', '7', '10', '13', '16', '20'];
    const frag = document.createDocumentFragment();

    tiers.forEach((l, i) => {
        const t = h.talents?.[l]?.[p[i] - 1] || h.talents?.[l]?.[0];
        const el = document.createElement('div');

        el.className = 'hots-subpanel rounded p-2 flex flex-col items-center gap-2 transition-all hover:border-cyan-400/60';

        if (t) {
            if (typeof showTalentTooltip === 'function') {
                el.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            }
            if (typeof hideTooltip === 'function') {
                el.addEventListener('mouseleave', hideTooltip);
            }

            el.innerHTML = `
                <img src="${resolveHeroUiPortraitUrl(t.icon)}" onerror="this.onerror=null;this.src='https://via.placeholder.com/44?text=?'" class="w-11 h-11 rounded-sm border border-[#4a2b9c] object-cover">
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

function renderActiveBuild() {
    const h = currentHeroData;
    if (!h) return;

    const keyFn = typeof normalizeHeroKey === 'function'
        ? normalizeHeroKey
        : v => String(v || '').toLowerCase();

    const d = (PERSONAL_BUILDS || []).find(x => keyFn(x.heroId) === keyFn(h.id));
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

async function selectHero(id, update = true) {
    if (!id) return;

    currentSelectedHeroId = id;
    currentBuildIndex = 0;

    if (typeof switchTabUI === 'function') {
        switchTabUI('builds');
    }

    if (update && typeof navigateTo === 'function') {
        navigateTo('builds', { hero: id });
    }

    filterHeroes();

    const heroData = typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(id) : null;
    if (!heroData) {
        console.error('Missing hero master entry', id);
        return;
    }

    currentHeroData = heroData;
    renderHeroHeader(currentHeroData);
    renderActiveBuild();
}
