// ======================================
// 1. TAB & VIEW SWITCHING
// ======================================

let lastActiveTab = null;
let lastHandledRouteSignature = null;
let isHandlingRoute = false;

function normalizeRouterTab(tab) {
    if (window.HeroesVaultRouterState && typeof window.HeroesVaultRouterState.normalizeTab === 'function') {
        return window.HeroesVaultRouterState.normalizeTab(tab);
    }
    const clean = String(tab || '').trim().toLowerCase().replace(/^#/, '').replace(/^view-/, '');
    if (!clean || clean === 'index' || clean === 'index.html') return 'home';
    if (clean === 'heroes') return 'builds';
    if (clean === 'patch' || clean === 'patches') return 'patchnotes';
    if (clean === 'tier' || clean === 'tiers' || clean === 'tier-list') return 'tierlist';
    return clean;
}

function switchTabUI(t, { force = false } = {}) {
    const activeTab = normalizeRouterTab(t);

    if (!force && lastActiveTab === activeTab) {
        if (activeTab === 'patchnotes' && typeof schedulePatchSidebarSync === 'function') {
            schedulePatchSidebarSync();
        }
        return;
    }

    lastActiveTab = activeTab;

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

    if (activeTab === 'patchnotes' && typeof schedulePatchSidebarSync === 'function') {
        schedulePatchSidebarSync();
    }
}


// ==========================================
// 2. HASH / QUERY NAVIGATION & CLEANUP
// ==========================================

function getFallbackRosterHeroId() {
    if (window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog.getAllHeroes === 'function') {
        const indexed = window.HeroesVaultCatalog.getAllHeroes();
        if (Array.isArray(indexed) && indexed[0]?.id) {
            return indexed[0].id;
        }
    }
    if (typeof MASTER_HERO_LIST === 'undefined' || !Array.isArray(MASTER_HERO_LIST)) {
        return null;
    }
    return MASTER_HERO_LIST[0]?.id || null;
}

function resolveRouteHeroId(candidateId) {
    const fallbackId = getFallbackRosterHeroId();
    if (!candidateId) return fallbackId;

    if (window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog.getHero === 'function') {
        const catalogHero = window.HeroesVaultCatalog.getHero(candidateId);
        if (catalogHero?.id) return catalogHero.id;
    }

    if (typeof getNormalizedHeroData === 'function') {
        const normalized = getNormalizedHeroData(candidateId);
        if (normalized?.id) return normalized.id;
    }

    if (typeof MASTER_HERO_LIST !== 'undefined' && Array.isArray(MASTER_HERO_LIST)) {
        const normKey = typeof normalizeHeroKey === 'function'
            ? normalizeHeroKey
            : v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normKey(candidateId);
        const match = MASTER_HERO_LIST.find(h => {
            if (!h || typeof h !== 'object') return false;
            return normKey(h.id) === target || normKey(h.name) === target;
        });
        if (match?.id) return match.id;
    }

    return candidateId || fallbackId;
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

function buildTargetUrl(tab, params = {}) {
    if (window.HeroesVaultRouterState && typeof window.HeroesVaultRouterState.serializeRouteUrl === 'function') {
        return window.HeroesVaultRouterState.serializeRouteUrl(tab, params, window.location);
    }

    let hashTarget = '#' + tab;
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
            q.set(k, v);
        }
    });
    const queryString = q.toString();
    if (queryString) hashTarget += '?' + queryString;

    try {
        const currentUrl = new URL(window.location.href);
        for (const key of ['view', 'patch', 'patchId', 'feed']) {
            currentUrl.searchParams.delete(key);
        }
        currentUrl.hash = hashTarget;
        return currentUrl.toString();
    } catch (_) {
        return hashTarget;
    }
}

function navigateTo(tab, params = {}, push = true) {
    const normalizedTab = normalizeRouterTab(tab);
    const cleanParams = params && typeof params === 'object' ? params : {};

    if (window.HeroesVaultRouterState && typeof window.HeroesVaultRouterState.writeHistoryRoute === 'function') {
        const wrote = window.HeroesVaultRouterState.writeHistoryRoute(normalizedTab, cleanParams, { replace: !push });
        if (!wrote) {
            location.hash = '#' + normalizedTab;
        }
    } else {
        const finalUrl = buildTargetUrl(normalizedTab, cleanParams);
        if (typeof window.history?.pushState === 'function' && typeof window.history?.replaceState === 'function') {
            if (push) {
                history.pushState({ tab: normalizedTab, params: cleanParams }, '', finalUrl);
            } else {
                history.replaceState({ tab: normalizedTab, params: cleanParams }, '', finalUrl);
            }
        } else {
            location.hash = finalUrl.startsWith('#') ? finalUrl : '#' + normalizedTab;
        }
    }

    handleRoute({ force: true });
}

function parseCurrentRouteLocation() {
    if (window.HeroesVaultRouterState && typeof window.HeroesVaultRouterState.parseUrlRoute === 'function') {
        return window.HeroesVaultRouterState.parseUrlRoute(window.location);
    }

    const [tpart, query = ''] = location.hash.replace(/^#/, '').split('?');
    const tab = normalizeRouterTab(tpart || 'home');
    const q = new URLSearchParams(query);
    const params = {};
    for (const [k, v] of q.entries()) {
        if (v !== '') params[k] = v;
    }
    return { tab, params };
}

function resolveBuilderRouteParams(paramsOrQuery) {
    const fallbackHeroId = getFallbackRosterHeroId();
    const decodeOpts = { allowZero: true };

    const rawHero = typeof paramsOrQuery === 'string'
        ? new URLSearchParams(paramsOrQuery).get('hero')
        : paramsOrQuery?.hero;

    const rawCode = typeof paramsOrQuery === 'string'
        ? (new URLSearchParams(paramsOrQuery).get('build') ||
            new URLSearchParams(paramsOrQuery).get('talents') ||
            new URLSearchParams(paramsOrQuery).get('code') ||
            '')
        : (paramsOrQuery?.build || paramsOrQuery?.talents || paramsOrQuery?.code || '');

    if (typeof parseBuilderQuery === 'function') {
        const searchStr = typeof paramsOrQuery === 'string'
            ? `?${paramsOrQuery}`
            : `?${new URLSearchParams({
                ...(rawHero ? { hero: rawHero } : {}),
                ...(rawCode ? { build: rawCode } : {})
            }).toString()}`;
        const parsed = parseBuilderQuery(searchStr, decodeOpts);
        return {
            heroId: resolveRouteHeroId(parsed.hero) || fallbackHeroId,
            selections: parsed.rawCode
                ? (typeof decodeBuildCode === 'function'
                    ? decodeBuildCode(parsed.rawCode, decodeOpts)
                    : parsed.selections)
                : null
        };
    }

    return {
        heroId: resolveRouteHeroId(rawHero) || fallbackHeroId,
        selections: rawCode && typeof decodeBuildCode === 'function'
            ? decodeBuildCode(rawCode, decodeOpts)
            : null
    };
}

function handleRoute(options = {}) {
    const force = Boolean(options && options.force);
    if (isHandlingRoute && !force) return;

    const { tab, params } = parseCurrentRouteLocation();
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== null && v !== undefined && String(v) !== '') {
            q.set(k, String(v));
        }
    });

    const routeSig = `${tab}?${q.toString()}::active=${lastActiveTab || ''}`;
    if (!force && lastActiveTab === tab && lastHandledRouteSignature === routeSig) {
        return;
    }

    isHandlingRoute = true;
    try {
        if (tab !== 'patchnotes') {
            clearPatchQueryParamsFromUrl();
        }

        switchTabUI(tab, { force });

        if (tab === 'builds') {
            if (typeof selectHero === 'function') {
                selectHero(resolveRouteHeroId(q.get('hero')), false);
            }
        } else if (tab === 'map') {
            if (typeof selectMap === 'function') {
                selectMap(q.get('id') || 'alteracpass', false);
            }
        } else if (tab === 'builder') {
            if (typeof openBuilder === 'function') {
                const { heroId, selections } = resolveBuilderRouteParams(params);
                openBuilder(heroId, selections, false);
            }
        } else if (tab === 'academy') {
            if (typeof renderAcademy === 'function') {
                renderAcademy();
            }
        } else if (tab === 'patchnotes') {
            if (typeof initPatchNotes === 'function') {
                initPatchNotes({
                    patchId: q.get('patch') || null,
                    feed: q.get('feed') || null,
                    openView: true
                });
            }
        } else if (tab === 'tierlist') {
            if (typeof renderTierList === 'function') {
                renderTierList();
            }
        }

        lastHandledRouteSignature = `${tab}?${q.toString()}::active=${tab}`;
    } finally {
        isHandlingRoute = false;
    }
}

function bindNavigationEvents() {
    const brandTrigger = document.getElementById('brand-home-trigger');
    if (brandTrigger && brandTrigger.dataset.navBound !== 'true') {
        brandTrigger.dataset.navBound = 'true';
        brandTrigger.addEventListener('click', () => navigateTo('home'));
    }

    document.querySelectorAll('[data-nav-tab]').forEach(btn => {
        if (btn.dataset.navBound === 'true') return;
        btn.dataset.navBound = 'true';
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-nav-tab');
            if (tab) navigateTo(tab);
        });
    });
}

function initializeRouter() {
    bindNavigationEvents();
    if (!window.__heroesVaultPopstateBound) {
        window.__heroesVaultPopstateBound = true;
        window.addEventListener('popstate', () => handleRoute({ force: true }));
    }
    handleRoute({ force: true });
}
