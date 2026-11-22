// ==========================================
// 1. REQUIRED GLOBALS GUARD
// ==========================================

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

async function loadInitialData() {
    const [mr, br, mapr, tr] = await Promise.all([
        fetch('./data/heroes-master.json'),
        fetch('./data/builds.json'),
        fetch('./data/maps.json'),
        fetch('./data/tiers.json')
    ].map(p => p.catch(() => null)));

    if (mr?.ok) {
        const d = await mr.json();
        HOTS_MASTER_DATA = d.items || d;

        const rawHeroes = Array.isArray(HOTS_MASTER_DATA)
            ? HOTS_MASTER_DATA
            : Object.values(HOTS_MASTER_DATA);

        MASTER_HERO_LIST = rawHeroes.map(h => {
            const id = h.id || h.hyperlinkId || h.attributeId;
            return {
                id,
                name: h.name || 'Unknown Hero',
                title: h.title || 'Nexus Combatant',
                role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
                portrait: typeof getHeroPortrait === 'function' ? getHeroPortrait(h) : (h.portrait || ''),
                searchText: `${h.name || ''} ${id || ''}`.toLowerCase()
            };
        });

        if (typeof preloadAllAssets === 'function') {
            preloadAllAssets(rawHeroes);
        }
    }

    if (br?.ok) PERSONAL_BUILDS = await br.json();
    if (mapr?.ok) {
        MASTER_MAP_LIST = await mapr.json();
        if (typeof populateMapsDropdown === 'function') {
            populateMapsDropdown();
        }
    }
    if (tr?.ok) MASTER_TIERS = await tr.json();
}


// ==========================================
// 3. FEATURE & ROUTER BOOTSTRAP
// ==========================================

function initializeFeatures() {
    if (typeof initializeTooltips === 'function') {
        initializeTooltips();
    }

    if (typeof renderHeroSidebar === 'function') {
        renderHeroSidebar(MASTER_HERO_LIST);
    }

    if (typeof renderTierList === 'function') {
        renderTierList();
    }

    syncHomeSummaryCounts();

    if (typeof loadAndRenderRotation === 'function') {
        loadAndRenderRotation();
    }

    if (typeof initPatchNotes === 'function') {
        initPatchNotes({ hydrateHome: true });
    } else if (typeof initPatchFilterControls === 'function') {
        initPatchFilterControls();
    }

    if (window.lucide) {
        lucide.createIcons();
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('#maps-dropdown-menu') && !e.target.closest('#maps-dropdown-toggle')) {
            document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        assertRequiredGlobals();
        await loadInitialData();
        initializeFeatures();
        initializeRouter();
    } catch (e) {
        console.error('[HeroesVault] Failed initializing app:', e);
    }
});
