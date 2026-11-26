// =======================================
// 1. TAB & VIEW SWITCHING
// =======================================

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


And routerstate:

// =========================================
// HEROESVAULT ROUTER & URL STATE MODULE
// =========================================

(function initHeroesVaultRouterState(global) {
    'use strict';

    const KNOWN_TABS = new Set([
        'home',
        'builds',
        'map',
        'builder',
        'academy',
        'patchnotes',
        'tierlist'
    ]);

    const DEFAULT_TAB = 'home';
    const MANAGED_QUERY_KEYS = ['view', 'hero', 'build', 'talents', 'code', 'id', 'patch', 'patchId', 'feed'];

    function normalizeTab(tab) {
        const clean = String(tab || '')
            .trim()
            .toLowerCase()
            .replace(/^#/, '')
            .replace(/^view-/, '');

        if (!clean || clean === 'index' || clean === 'index.html') {
            return DEFAULT_TAB;
        }
        if (clean === 'patch' || clean === 'patches') {
            return 'patchnotes';
        }
        if (clean === 'tier' || clean === 'tiers' || clean === 'tier-list') {
            return 'tierlist';
        }
        return KNOWN_TABS.has(clean) ? clean : DEFAULT_TAB;
    }

    function parseUrlRoute(locationObj = null) {
        const loc = locationObj || (global.location ? global.location : null);
        if (!loc) {
            return { tab: DEFAULT_TAB, params: {} };
        }

        const searchParams = new URLSearchParams(loc.search || '');
        const hashRaw = String(loc.hash || '').replace(/^#/, '');

        let hashTab = '';
        let hashParams = new URLSearchParams();

        if (hashRaw) {
            const qIndex = hashRaw.indexOf('?');
            if (qIndex !== -1) {
                hashTab = hashRaw.slice(0, qIndex);
                hashParams = new URLSearchParams(hashRaw.slice(qIndex + 1));
            } else {
                hashTab = hashRaw;
            }
        }

        const rawTab = searchParams.get('view') || hashTab || DEFAULT_TAB;
        const tab = normalizeTab(rawTab);

        const params = {};
        const mergeParams = sourceParams => {
            for (const [key, value] of sourceParams.entries()) {
                if (key === 'view') continue;
                const trimmed = String(value ?? '').trim();
                if (trimmed) {
                    params[key] = trimmed;
                }
            }
        };

        mergeParams(searchParams);
        mergeParams(hashParams);

        if (!params.build && (params.talents || params.code)) {
            params.build = params.talents || params.code;
        }
        if (!params.patch && params.patchId) {
            params.patch = params.patchId;
        }

        return { tab, params };
    }

    function serializeRouteUrl(tab, params = {}, locationObj = null) {
        const loc = locationObj || (global.location ? global.location : null);
        if (!loc) return '#home';

        const normalizedTab = normalizeTab(tab);
        const url = new URL(loc.href);

        for (const key of MANAGED_QUERY_KEYS) {
            url.searchParams.delete(key);
        }

        const cleanParams = params && typeof params === 'object' ? params : {};

        if (normalizedTab === 'builder') {
            if (cleanParams.hero) {
                url.searchParams.set('hero', String(cleanParams.hero).trim());
            }
            const codeVal = cleanParams.build || cleanParams.talents || cleanParams.code;
            if (codeVal) {
                url.searchParams.set('build', String(codeVal).trim());
            }
            url.hash = '#builder';
            return url.toString();
        }

        const hashParams = new URLSearchParams();

        if (normalizedTab === 'builds') {
            if (cleanParams.hero) {
                hashParams.set('hero', String(cleanParams.hero).trim());
            }
        } else if (normalizedTab === 'map') {
            if (cleanParams.id) {
                hashParams.set('id', String(cleanParams.id).trim());
            }
        } else if (normalizedTab === 'patchnotes') {
            const patchVal = cleanParams.patch || cleanParams.patchId || cleanParams.id;
            if (patchVal) {
                hashParams.set('patch', String(patchVal).trim());
            }
            if (cleanParams.feed && cleanParams.feed !== 'all') {
                hashParams.set('feed', String(cleanParams.feed).trim().toLowerCase());
            }
        } else {
            for (const [key, val] of Object.entries(cleanParams)) {
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    hashParams.set(key, String(val).trim());
                }
            }
        }

        const queryStr = hashParams.toString();
        url.hash = queryStr ? `#${normalizedTab}?${queryStr}` : `#${normalizedTab}`;
        return url.toString();
    }

    function writeHistoryRoute(tab, params = {}, { replace = false } = {}) {
        const loc = global.location;
        const hist = global.history;
        if (!loc || !hist) return false;

        const nextUrl = serializeRouteUrl(tab, params, loc);
        if (loc.href === nextUrl) return false;

        const normalizedTab = normalizeTab(tab);
        const stateObj = {
            tab: normalizedTab,
            params: params && typeof params === 'object' ? { ...params } : {}
        };

        try {
            if (!replace && typeof hist.pushState === 'function') {
                hist.pushState(stateObj, '', nextUrl);
            } else if (typeof hist.replaceState === 'function') {
                hist.replaceState(stateObj, '', nextUrl);
            } else {
                loc.href = nextUrl;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    global.HeroesVaultRouterState = {
        KNOWN_TABS: Array.from(KNOWN_TABS),
        DEFAULT_TAB,
        normalizeTab,
        parseUrlRoute,
        serializeRouteUrl,
        writeHistoryRoute
    };
})(window);
