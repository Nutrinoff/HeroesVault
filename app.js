// ==========================================
// 0. BACKEND / TUNNEL CONFIGURATION
// ==========================================

const HEROESVAULT_API_BASE = 'https://s-st-01.anteater-bushmaster.ts.net';
window.HEROESVAULT_API_BASE = HEROESVAULT_API_BASE;


// ==========================================
// 1. REQUIRED GLOBALS & RUNTIME VALIDATION
// ==========================================

let initialDataPromise = null;
let initialDataLoaded = false;
let secondaryDataPromise = null;
let secondaryDataLoaded = false;
let featuresInitPromise = null;
let featuresInitialized = false;
let appBootstrapPromise = null;
let appBootstrapped = false;

const featureInitDiagnostics = new Map();
window.__HEROESVAULT_FEATURE_HEALTH__ = featureInitDiagnostics;

function getAppApi() {
    return typeof window !== 'undefined' && window.HeroesVaultApi && typeof window.HeroesVaultApi === 'object'
        ? window.HeroesVaultApi
        : null;
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
    if (!Array.isArray(MASTER_HERO_LIST) || MASTER_HERO_LIST.length === 0) {
        console.warn('[HeroesVault] MASTER_HERO_LIST is empty or invalid.');
    }
    if (!Array.isArray(PERSONAL_BUILDS)) {
        console.warn('[HeroesVault] PERSONAL_BUILDS is not an array.');
    }
    if (!Array.isArray(MASTER_MAP_LIST)) {
        console.warn('[HeroesVault] MASTER_MAP_LIST is not an array.');
    }
}


// ==========================================
// 2. DATA LOADING (CORE FIRST, CATALOGS TRICKLE)
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

async function loadSecondaryData({ force = false } = {}) {
    if (!force && secondaryDataLoaded) {
        return;
    }
    if (!force && secondaryDataPromise) {
        return secondaryDataPromise;
    }

    secondaryDataPromise = (async () => {
        try {
            const api = getAppApi();
            const [buildsRaw, tiersRaw] = await Promise.all([
                typeof api?.fetchBuildsCatalog === 'function'
                    ? api.fetchBuildsCatalog({ force })
                    : Promise.resolve(null),
                typeof api?.fetchTierListCatalog === 'function'
                    ? api.fetchTierListCatalog({ force })
                    : Promise.resolve(null)
            ]);

            const buildsData = normalizeBuildsPayload(buildsRaw);
            if (Array.isArray(buildsData)) {
                PERSONAL_BUILDS = buildsData;
            }

            const tiersData = normalizeTiersPayload(tiersRaw);
            if (tiersData && typeof tiersData === 'object') {
                MASTER_TIERS = tiersData;
            }

            syncHomeSummaryCounts();

            if (typeof renderTierList === 'function') {
                renderTierList();
            }

            secondaryDataLoaded = true;
        } catch (err) {
            console.warn('[HeroesVault] Background builds/tierlist load failed:', err);
        } finally {
            secondaryDataPromise = null;
        }
    })();

    return secondaryDataPromise;
}

window.loadSecondaryData = loadSecondaryData;

async function loadInitialData({ force = false } = {}) {
    if (!force && initialDataLoaded) {
        return;
    }
    if (!force && initialDataPromise) {
        return initialDataPromise;
    }

    initialDataPromise = (async () => {
        try {
            const api = getAppApi();
            const [masterData, mapsData] = await Promise.all([
                typeof api?.fetchHeroesMasterCatalog === 'function'
                    ? api.fetchHeroesMasterCatalog({ force })
                    : Promise.resolve(null),
                typeof api?.fetchMapsCatalog === 'function'
                    ? api.fetchMapsCatalog({ force })
                    : Promise.resolve(null)
            ]);

            if (masterData) {
                const rawSource = masterData.items || masterData;
                HOTS_MASTER_DATA = rawSource;

                const rawHeroes = Array.isArray(rawSource)
                    ? rawSource
                    : (rawSource && typeof rawSource === 'object' ? Object.values(rawSource) : []);

                MASTER_HERO_LIST = rawHeroes
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
            }

            if (Array.isArray(mapsData)) {
                MASTER_MAP_LIST = mapsData;
                if (typeof populateMapsDropdown === 'function') {
                    populateMapsDropdown();
                }
            }

            validateLoadedDataShapes();
            initialDataLoaded = true;

            // Trickle builds and tierlist catalogs in shortly after core data loads
            loadSecondaryData({ force });
        } finally {
            initialDataPromise = null;
        }
    })();

    return initialDataPromise;
}


// ==========================================
// 3. FEATURE & ROUTER BOOTSTRAP
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

function refreshIcons(root = document) {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root });
    }
}

window.refreshHeroesVaultIcons = refreshIcons;

async function initializeFeatures({ force = false } = {}) {
    if (!force && featuresInitialized) {
        return;
    }
    if (!force && featuresInitPromise) {
        return featuresInitPromise;
    }

    featuresInitPromise = (async () => {
        try {
            featureInitDiagnostics.clear();

            await runFeatureSafe('initializeTooltips', () => {
                if (typeof initializeTooltips === 'function') {
                    return initializeTooltips();
                }
            });

            await runFeatureSafe('initializeHeroSidebar', () => {
                if (typeof initializeHeroSidebar === 'function') {
                    return initializeHeroSidebar(MASTER_HERO_LIST);
                }
                if (typeof renderHeroSidebar === 'function') {
                    return renderHeroSidebar(MASTER_HERO_LIST);
                }
            });

            await runFeatureSafe('syncHomeSummaryCounts', syncHomeSummaryCounts);

            await runFeatureSafe('loadAndRenderRotation', async () => {
                if (typeof loadAndRenderRotation === 'function') {
                    await loadAndRenderRotation();
                }
            });

            await runFeatureSafe('initPatchNotes', () => {
                if (typeof initPatchNotes === 'function') {
                    return initPatchNotes({ hydrateHome: true });
                }
                if (typeof initPatchFilterControls === 'function') {
                    return initPatchFilterControls();
                }
            });

            await runFeatureSafe('bindGlobalDismissHandlers', bindGlobalDismissHandlers);

            await runFeatureSafe('lucide.createIcons', () => {
                refreshIcons(document.body || document);
            });

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
            await loadInitialData();
            await initializeFeatures();
            if (typeof initializeRouter === 'function') {
                initializeRouter();
            }
            appBootstrapped = true;
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
