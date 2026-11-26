async function handleRoute(options = {}) {
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

        if (typeof ensureDataForTab === 'function') {
            await ensureDataForTab(tab);
        }

        if ((tab === 'builds' || tab === 'builder') && typeof initializeHeroSidebar === 'function') {
            initializeHeroSidebar(typeof MASTER_HERO_LIST !== 'undefined' ? MASTER_HERO_LIST : []);
        }

        if (tab === 'builds') {
            if (typeof selectHero === 'function') {
                await selectHero(resolveRouteHeroId(q.get('hero')), false);
            }
        } else if (tab === 'map') {
            if (typeof selectMap === 'function') {
                await selectMap(q.get('id') || 'alteracpass', false);
            }
        } else if (tab === 'builder') {
            if (typeof openBuilder === 'function') {
                const { heroId, selections } = resolveBuilderRouteParams(params);
                await openBuilder(heroId, selections, false);
            }
        } else if (tab === 'academy') {
            if (typeof renderAcademy === 'function') {
                await renderAcademy();
            }
        } else if (tab === 'patchnotes') {
            if (typeof initPatchNotes === 'function') {
                await initPatchNotes({
                    patchId: q.get('patch') || null,
                    feed: q.get('feed') || null,
                    openView: true
                });
            }
        } else if (tab === 'tierlist') {
            if (typeof renderTierList === 'function') {
                await renderTierList();
            }
        }

        if (typeof refreshLucideIcons === 'function') {
            refreshLucideIcons();
        }

        lastHandledRouteSignature = `${tab}?${q.toString()}::active=${tab}`;
    } finally {
        isHandlingRoute = false;
    }
}

function initializeRouter(options = {}) {
    const deferInitialRoute = Boolean(options && options.deferInitialRoute);
    bindNavigationEvents();
    if (!window.__heroesVaultPopstateBound) {
        window.__heroesVaultPopstateBound = true;
        window.addEventListener('popstate', () => handleRoute({ force: true }));
    }
    if (!deferInitialRoute) {
        handleRoute({ force: true });
    }
}
