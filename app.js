// ==========================================
// 0. BACKEND / TUNNEL CONFIGURATION
// ==========================================

const HEROESVAULT_API_BASE = 'https://s-st-01.anteater-bushmaster.ts.net';
window.HEROESVAULT_API_BASE = HEROESVAULT_API_BASE;


// ==========================================
// 1. REQUIRED GLOBALS & RUNTIME VALIDATION
// ==========================================

const LOADED_CATALOG_GROUPS = new Set();
const INFLIGHT_CATALOG_GROUPS = new Map();

let featuresInitPromise = null;
let featuresInitialized = false;
let appBootstrapPromise = null;
let appBootstrapped = false;
let trickleScheduled = false;

const featureInitDiagnostics = new Map();
window.__HEROESVAULT_FEATURE_HEALTH__ = featureInitDiagnostics;

function getAppApi() {
    return typeof window !== 'undefined' && window.HeroesVaultApi && typeof window.HeroesVaultApi === 'object'
        ? window.HeroesVaultApi
        : null;
}

function refreshLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function assertRequiredGlobals() {
    const requiredFunctions = [
        'normalizeTalentSelections',
        'encodeTalentSelections',
        'encodeBuildCode',
        'decodeBuildCode',
        'getRawHeroEntry',
        'getNormalizedHeroData',
        'renderHeroSidebar',
        'filterHeroes',
        'selectHero',
        'renderBuilderHeader',
        'initializeTooltips',
        'initializeRouter'
    ];

    const missing = requiredFunctions.filter(fnName => typeof window[fnName] !== 'function');
    if (missing.length > 0) {
        console.error('[HeroesVault] Missing required module functions or bad script order:', missing);
    }

    const requiredDomIds = [
        'view-home',
        'view-builds',
        'view-map',
        'view-builder',
        'view-academy',
        'view-patchnotes',
        'view-tierlist',
        'maps-dropdown-toggle',
        'maps-dropdown-menu',
        'talent-tooltip'
    ];

    const missingIds = requiredDomIds.filter(id => !document.getElementById(id));
    if (missingIds.length > 0) {
        console.warn('[HeroesVault] Missing expected DOM elements:', missingIds);
    }
}

function validateLoadedDataShapes() {
    if (typeof MASTER_HERO_LIST === 'undefined' || !Array.isArray(MASTER_HERO_LIST) || MASTER_HERO_LIST.length === 0) {
        console.warn('[HeroesVault] MASTER_HERO_LIST is empty or invalid.');
    }
    if (typeof PERSONAL_BUILDS === 'undefined' || !Array.isArray(PERSONAL_BUILDS)) {
        console.warn('[HeroesVault] PERSONAL_BUILDS is not an array.');
    }
    if (typeof MASTER_MAP_LIST === 'undefined' || !Array.isArray(MASTER_MAP_LIST)) {
        console.warn('[HeroesVault] MASTER_MAP_LIST is not an array.');
    }
}


// ==========================================
// 2. TARGETED & TRICKLED DATA LOADING
// ==========================================

function syncHomeSummaryCounts() {
    const heroCountEl = document.getElementById('home-hero-count');
    const buildCountEl = document.getElementById('home-build-count');
    const guideCountEl = document.getElementById('home-guide-count');

    if (heroCountEl && typeof MASTER_HERO_LIST !== 'undefined' && Array.isArray(MASTER_HERO_LIST)) {
        heroCountEl.textContent = `${MASTER_HERO_LIST.length} Heroes`;
    }
    if (buildCountEl && typeof PERSONAL_BUILDS !== 'undefined' && Array.isArray(PERSONAL_BUILDS)) {
        buildCountEl.textContent = `${PERSONAL_BUILDS.length} Sets`;
    }
    if (guideCountEl && typeof getAcademyArticlesList === 'function') {
        const guides = getAcademyArticlesList();
        if (Array.isArray(guides)) {
            guideCountEl.textContent = `${guides.length} Guides`;
        }
    }
}

function normalizeBuildsPayload(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.builds)) return raw.builds;
        if (Array.isArray(raw.items)) return raw.items;
        if (Array.isArray(raw.data)) return raw.data;
    }
    return null;
}

function normalizeTierKey(rawKey) {
    const clean = String(rawKey || '').trim().toUpperCase();
    if (clean === 'STIER' || clean === 'S') return 'S';
    if (clean === 'ATIER' || clean === 'A') return 'A';
    if (clean === 'BTIER' || clean === 'B') return 'B';
    if (clean === 'CTIER' || clean === 'C') return 'C';
    if (clean === 'DTIER' || clean === 'D') return 'D';

    if (typeof tierLetter === 'function') {
        const mapped = String(tierLetter(rawKey) || '').trim().toUpperCase();
        if (['S', 'A', 'B', 'C', 'D'].includes(mapped)) {
            return mapped;
        }
    }

    return null;
}

function normalizeTiersPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const src =
        raw.tierlist && typeof raw.tierlist === 'object' && !Array.isArray(raw.tierlist)
            ? raw.tierlist
            : raw.tiers && typeof raw.tiers === 'object' && !Array.isArray(raw.tiers)
                ? raw.tiers
                : raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
                    ? raw.data
                    : raw;

    const normalized = { S: [], A: [], B: [], C: [], D: [] };
    let matchedAnyTierKey = false;

    for (const [key, val] of Object.entries(src)) {
        const tier = normalizeTierKey(key);
        if (!tier || !Array.isArray(val)) continue;
        matchedAnyTierKey = true;
        normalized[tier] = val.slice();
    }

    return matchedAnyTierKey ? normalized : null;
}

function applyHeroesCatalog(masterData) {
    if (!masterData) return;
    const rawSource = masterData.items || masterData;
    window.HOTS_MASTER_DATA = rawSource;

    const rawHeroes = Array.isArray(rawSource)
        ? rawSource
        : (rawSource && typeof rawSource === 'object' ? Object.values(rawSource) : []);

    window.MASTER_HERO_LIST = rawHeroes
        .filter(Boolean)
        .map(h => {
            const id = h.id || h.hyperlinkId || h.attributeId;
            const portraitPath = typeof getHeroPortrait === 'function'
                ? getHeroPortrait(h)
                : (typeof extractPortraitPath === 'function' ? extractPortraitPath(h) : (h.portrait || ''));

            return {
                id,
                name: h.name || 'Unknown Hero',
                title: h.title || 'Nexus Combatant',
                role: (Array.isArray(h.roles) && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
                portrait: portraitPath,
                searchText: `${h.name || ''} ${id || ''}`.toLowerCase()
            };
        });

    if (window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog.rebuild === 'function') {
        window.HeroesVaultCatalog.rebuild(true);
    }
    syncHomeSummaryCounts();
}

function applyBuildsCatalog(buildsRaw) {
    const buildsData = normalizeBuildsPayload(buildsRaw);
    if (Array.isArray(buildsData)) {
        window.PERSONAL_BUILDS = buildsData;
    }
    syncHomeSummaryCounts();
}

function applyMapsCatalog(mapsData) {
    if (Array.isArray(mapsData)) {
        window.MASTER_MAP_LIST = mapsData;
        if (typeof populateMapsDropdown === 'function') {
            populateMapsDropdown();
        }
    }
}

function applyTiersCatalog(tiersRaw) {
    const tiersData = normalizeTiersPayload(tiersRaw);
    if (tiersData && typeof tiersData === 'object') {
        window.MASTER_TIERS = tiersData;
        if (window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog.rebuild === 'function') {
            window.HeroesVaultCatalog.rebuild(true);
        }
    }
}

async function loadCatalogGroup(group, { force = false } = {}) {
    if (!force && LOADED_CATALOG_GROUPS.has(group)) {
        return;
    }
    if (!force && INFLIGHT_CATALOG_GROUPS.has(group)) {
        return INFLIGHT_CATALOG_GROUPS.get(group);
    }

    const api = getAppApi();
    const task = (async () => {
        try {
            if (group === 'heroes') {
                const masterData = typeof api?.fetchHeroesMasterCatalog === 'function'
                    ? await api.fetchHeroesMasterCatalog({ force })
                    : null;
                applyHeroesCatalog(masterData);
            } else if (group === 'builds') {
                const buildsRaw = typeof api?.fetchBuildsCatalog === 'function'
                    ? await api.fetchBuildsCatalog({ force })
                    : null;
                applyBuildsCatalog(buildsRaw);
            } else if (group === 'maps') {
                const mapsData = typeof api?.fetchMapsCatalog === 'function'
                    ? await api.fetchMapsCatalog({ force })
                    : null;
                applyMapsCatalog(mapsData);
            } else if (group === 'tiers') {
                const tiersRaw = typeof api?.fetchTierListCatalog === 'function'
                    ? await api.fetchTierListCatalog({ force })
                    : null;
                applyTiersCatalog(tiersRaw);
            } else if (group === 'academy') {
                if (typeof api?.fetchAcademyList === 'function') {
                    await api.fetchAcademyList({ force });
                }
                syncHomeSummaryCounts();
            }

            LOADED_CATALOG_GROUPS.add(group);
        } finally {
            if (INFLIGHT_CATALOG_GROUPS.get(group) === task) {
                INFLIGHT_CATALOG_GROUPS.delete(group);
            }
        }
    })();

    INFLIGHT_CATALOG_GROUPS.set(group, task);
    return task;
}

function getGroupsForTab(tab) {
    switch (tab) {
        case 'builder':
        case 'builds':
            return ['heroes', 'builds'];
        case 'map':
            return ['maps'];
        case 'tierlist':
            return ['heroes', 'tiers'];
        case 'academy':
            return ['academy'];
        case 'home':
        case 'patchnotes':
        default:
            return ['heroes'];
    }
}

async function ensureDataForTab(tab, { force = false } = {}) {
    const groups = getGroupsForTab(tab);
    await Promise.all(groups.map(group => loadCatalogGroup(group, { force })));
}

async function loadInitialData({ force = false, priorityTab = 'home' } = {}) {
    const initialGroups = getGroupsForTab(priorityTab);
    await Promise.all(initialGroups.map(group => loadCatalogGroup(group, { force })));
    validateLoadedDataShapes();
}


// ==========================================
// 3. SOFT BACKGROUND TRICKLE
// ==========================================

function waitForTrickleSlot(delayMs = 140) {
    return new Promise(resolve => {
        const finish = () => setTimeout(resolve, delayMs);
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => finish(), { timeout: 600 });
        } else {
            finish();
        }
    });
}

function startSoftBackgroundTrickle(priorityTab = 'home') {
    if (trickleScheduled) return;
    trickleScheduled = true;

    const trickleSteps = [
        {
            key: 'home-widgets',
            run: async () => {
                if (priorityTab === 'home') return;
                await Promise.allSettled([
                    runFeatureSafe('trickle:rotation', async () => {
                        if (typeof loadAndRenderRotation === 'function') {
                            await loadAndRenderRotation();
                        }
                    }),
                    runFeatureSafe('trickle:home-patches', async () => {
                        if (typeof initPatchNotes === 'function') {
                            await initPatchNotes({ hydrateHome: true });
                        }
                    })
                ]);
            }
        },
        {
            key: 'catalog:heroes',
            run: () => loadCatalogGroup('heroes')
        },
        {
            key: 'catalog:builds',
            run: () => loadCatalogGroup('builds')
        },
        {
            key: 'catalog:maps',
            run: () => loadCatalogGroup('maps')
        },
        {
            key: 'catalog:tiers',
            run: () => loadCatalogGroup('tiers')
        },
        {
            key: 'catalog:academy',
            run: () => loadCatalogGroup('academy')
        }
    ];

    (async () => {
        await waitForTrickleSlot(220);

        for (const step of trickleSteps) {
            await runFeatureSafe(step.key, step.run);
            await waitForTrickleSlot(160);
        }
    })();
}


// ==========================================
// 4. FEATURE & ROUTER BOOTSTRAP
// ==========================================

async function runFeatureSafe(label, fn) {
    const startedAt = Date.now();
    try {
        const result = await fn();
        featureInitDiagnostics.set(label, {
            status: 'ok',
            durationMs: Date.now() - startedAt,
            error: null
        });
        return result;
    } catch (err) {
        featureInitDiagnostics.set(label, {
            status: 'error',
            durationMs: Date.now() - startedAt,
            error: err instanceof Error ? err.message : String(err)
        });
        console.error(`[HeroesVault] ${label} failed:`, err);
        return undefined;
    }
}

function logFeatureInitializationSummary() {
    const entries = Array.from(featureInitDiagnostics.entries());
    const failed = entries.filter(([, info]) => info.status === 'error');
    if (failed.length > 0) {
        console.warn(
            `[HeroesVault] Feature initialization completed with ${failed.length} failure(s):`,
            Object.fromEntries(failed)
        );
    }
}

function bindGlobalDismissHandlers() {
    if (!document.body || document.body.dataset.mapsDropdownBound === 'true') return;
    document.body.dataset.mapsDropdownBound = 'true';

    document.addEventListener('click', e => {
        if (!e.target.closest('#maps-dropdown-menu') && !e.target.closest('#maps-dropdown-toggle')) {
            if (typeof closeMapsDropdown === 'function') {
                closeMapsDropdown();
            } else {
                document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
            }
        }
    });
}

function initRouterOnce() {
    if (document.body?.dataset.routerInitialized === 'true') return;
    if (typeof initializeRouter === 'function') {
        if (document.body) {
            document.body.dataset.routerInitialized = 'true';
        }
        initializeRouter({ deferInitialRoute: true });
    }
}

async function hydratePriorityRoute(initialRoute) {
    const tab = initialRoute?.tab || 'home';
    const params = initialRoute?.params || {};

    if (tab === 'home') {
        await Promise.allSettled([
            runFeatureSafe('loadAndRenderRotation', async () => {
                if (typeof loadAndRenderRotation === 'function') {
                    await loadAndRenderRotation();
                }
            }),
            runFeatureSafe('initPatchNotes:home', async () => {
                if (typeof initPatchNotes === 'function') {
                    await initPatchNotes({ hydrateHome: true });
                } else if (typeof initPatchFilterControls === 'function') {
                    await initPatchFilterControls();
                }
            })
        ]);
        return;
    }

    if (typeof handleRoute === 'function') {
        await handleRoute({ force: true });
    }
}

async function initializeFeatures({ force = false, priorityTab = 'home' } = {}) {
    if (!force && featuresInitialized) {
        return;
    }
    if (!force && featuresInitPromise) {
        return featuresInitPromise;
    }

    featuresInitPromise = (async () => {
        try {
            featureInitDiagnostics.clear();

            await runFeatureSafe('bindGlobalDismissHandlers', bindGlobalDismissHandlers);
            await runFeatureSafe('syncHomeSummaryCounts', syncHomeSummaryCounts);
            await runFeatureSafe('lucide.createIcons:initial', refreshLucideIcons);

            await runFeatureSafe('initializeTooltips', () => {
                if (typeof initializeTooltips === 'function') {
                    return initializeTooltips();
                }
            });

            if (priorityTab === 'builds' || priorityTab === 'builder') {
                await runFeatureSafe('initializeHeroSidebar', () => {
                    const list = typeof MASTER_HERO_LIST !== 'undefined' ? MASTER_HERO_LIST : [];
                    if (typeof initializeHeroSidebar === 'function') {
                        return initializeHeroSidebar(list);
                    }
                    if (typeof renderHeroSidebar === 'function') {
                        return renderHeroSidebar(list);
                    }
                });
            }

            await runFeatureSafe('lucide.createIcons:postHydration', refreshLucideIcons);

            logFeatureInitializationSummary();
            featuresInitialized = true;
        } finally {
            featuresInitPromise = null;
        }
    })();

    return featuresInitPromise;
}

async function bootstrapApp() {
    if (appBootstrapped) return;
    if (appBootstrapPromise) return appBootstrapPromise;

    appBootstrapPromise = (async () => {
        try {
            assertRequiredGlobals();

            const initialRoute = typeof parseCurrentRouteLocation === 'function'
                ? parseCurrentRouteLocation()
                : { tab: 'home', params: {} };
            const priorityTab = initialRoute.tab || 'home';

            // Show the target tab shell immediately while keeping non-target tabs hidden
            await runFeatureSafe('initializeRouter', initRouterOnce);
            if (typeof switchTabUI === 'function') {
                switchTabUI(priorityTab, { force: true });
            }
            await runFeatureSafe('lucide.createIcons:preData', refreshLucideIcons);

            // Load only the data required for the landing route first
            await loadInitialData({ priorityTab });
            await initializeFeatures({ priorityTab });
            await hydratePriorityRoute(initialRoute);
            await runFeatureSafe('lucide.createIcons:afterPriorityRoute', refreshLucideIcons);

            appBootstrapped = true;

            // Softly trickle in the remaining catalogs and views in the background
            startSoftBackgroundTrickle(priorityTab);
        } catch (e) {
            console.error('[HeroesVault] Failed initializing app:', e);
        } finally {
            appBootstrapPromise = null;
        }
    })();

    return appBootstrapPromise;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp, { once: true });
} else {
    bootstrapApp();
}
