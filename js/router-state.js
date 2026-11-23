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
