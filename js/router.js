// =======================================
// 1. TAB & VIEW SWITCHING
// =======================================

let lastActiveTab = null;
let lastHandledRouteSignature = null;
let isHandlingRoute = false;

function switchTabUI(t, { force = false } = {}) {
    const activeTab = t === 'heroes' ? 'builds' : (t || 'home');

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
    if (typeof MASTER_HERO_LIST === 'undefined' || !Array.isArray(MASTER_HERO_LIST)) {
        return null;
    }
    return MASTER_HERO_LIST[0]?.id || null;
}

function resolveRouteHeroId(candidateId) {
    const fallbackId = getFallbackRosterHeroId();
    if (!candidateId) return fallbackId;

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

function navigateTo(tab, params = {}, push = true) {
    const normalizedTab = tab === 'heroes' ? 'builds' : (tab || 'home');
    let hashTarget = '#' + normalizedTab;
    const q = new URLSearchParams();

    Object.entries(params || {}).forEach(([k, v]) => {
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

    if (typeof window.history?.pushState === 'function' && typeof window.history?.replaceState === 'function') {
        if (push) {
            history.pushState({ tab: normalizedTab, params }, '', finalUrl);
        } else {
            history.replaceState({ tab: normalizedTab, params }, '', finalUrl);
        }
    } else {
        location.hash = hashTarget;
    }

    handleRoute({ force: true });
}

function resolveBuilderRouteParams(query) {
    const fallbackHeroId = getFallbackRosterHeroId();

    if (typeof parseBuilderQuery === 'function') {
        const parsed = parseBuilderQuery(`?${query}`);
        return {
            heroId: resolveRouteHeroId(parsed.hero) || fallbackHeroId,
            selections: parsed.rawCode
                ? (typeof decodeBuildCode === 'function' ? decodeBuildCode(parsed.rawCode) : parsed.selections)
                : null
        };
    }

    const q = new URLSearchParams(query);
    const rawCode = q.get('build') || q.get('talents') || q.get('code') || '';
    return {
        heroId: resolveRouteHeroId(q.get('hero')) || fallbackHeroId,
        selections: rawCode && typeof decodeBuildCode === 'function' ? decodeBuildCode(rawCode) : null
    };
}

function handleRoute(options = {}) {
    const force = Boolean(options && options.force);
    if (isHandlingRoute && !force) return;

    const [tpart, query = ''] = location.hash.replace(/^#/, '').split('?');
    const rawTab = tpart || 'home';
    const tab = rawTab === 'heroes' ? 'builds' : rawTab;
    const q = new URLSearchParams(query);

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
                const { heroId, selections } = resolveBuilderRouteParams(query);
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
