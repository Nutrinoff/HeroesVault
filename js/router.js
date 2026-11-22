// ==========================================
// 1. TAB & VIEW SWITCHING
// ==========================================

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
// 2. HASH / QUERY NAVIGATION & CLEANUP
// ==========================================

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
            q.get('build') ? decodeBuildCode(q.get('build')) : null,
            false
        );
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
    window.addEventListener('popstate', handleRoute);
    handleRoute();
}
