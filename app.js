// ==========================================
// 1. REQUIRED GLOBALS & RUNTIME VALIDATION
// ==========================================

let initialDataPromise = null;
let initialDataLoaded = false;
let featuresInitPromise = null;
let featuresInitialized = false;
let appBootstrapPromise = null;
let appBootstrapped = false;

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
// 2. INITIAL DATA LOADING
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

async function fetchJsonSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn(`[HeroesVault] Failed fetching ${url}:`, err);
        return null;
    }
}

async function loadInitialData({ force = false } = {}) {
    if (!force && initialDataLoaded) {
        return;
    }
    if (!force && initialDataPromise) {
        return initialDataPromise;
    }

    initialDataPromise = (async () => {
        try {
            const [masterData, buildsData, mapsData, tiersData] = await Promise.all([
                fetchJsonSafe('./data/heroes-master.json'),
                fetchJsonSafe('./data/builds.json'),
                fetchJsonSafe('./data/maps.json'),
                fetchJsonSafe('./data/tiers.json')
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

            if (Array.isArray(buildsData)) {
                PERSONAL_BUILDS = buildsData;
            }

            if (Array.isArray(mapsData)) {
                MASTER_MAP_LIST = mapsData;
                if (typeof populateMapsDropdown === 'function') {
                    populateMapsDropdown();
                }
            }

            if (tiersData && typeof tiersData === 'object') {
                MASTER_TIERS = tiersData;
            }

            validateLoadedDataShapes();
            initialDataLoaded = true;
        } finally {
            initialDataPromise = null;
        }
    })();

    return initialDataPromise;
}


// ==========================================
// 3. FEATURE & ROUTER BOOTSTRAP
// ==========================================

function runFeatureSafe(label, fn) {
    try {
        return fn();
    } catch (err) {
        console.error(`[HeroesVault] ${label} failed:`, err);
        return undefined;
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

async function initializeFeatures({ force = false } = {}) {
    if (!force && featuresInitialized) {
        return;
    }
    if (!force && featuresInitPromise) {
        return featuresInitPromise;
    }

    featuresInitPromise = (async () => {
        try {
            runFeatureSafe('initializeTooltips', () => {
                if (typeof initializeTooltips === 'function') {
                    initializeTooltips();
                }
            });

            runFeatureSafe('initializeHeroSidebar', () => {
                if (typeof initializeHeroSidebar === 'function') {
                    initializeHeroSidebar(MASTER_HERO_LIST);
                } else if (typeof renderHeroSidebar === 'function') {
                    renderHeroSidebar(MASTER_HERO_LIST);
                }
            });

            runFeatureSafe('renderTierList', () => {
                if (typeof renderTierList === 'function') {
                    renderTierList();
                }
            });

            runFeatureSafe('syncHomeSummaryCounts', syncHomeSummaryCounts);

            await runFeatureSafe('loadAndRenderRotation', async () => {
                if (typeof loadAndRenderRotation === 'function') {
                    await loadAndRenderRotation();
                }
            });

            runFeatureSafe('initPatchNotes', () => {
                if (typeof initPatchNotes === 'function') {
                    initPatchNotes({ hydrateHome: true });
                } else if (typeof initPatchFilterControls === 'function') {
                    initPatchFilterControls();
                }
            });

            runFeatureSafe('bindGlobalDismissHandlers', bindGlobalDismissHandlers);

            runFeatureSafe('lucide.createIcons', () => {
                if (window.lucide) {
                    lucide.createIcons();
                }
            });

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
