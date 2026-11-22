// ==========================================
// 1. SHARED APPLICATION STATE & CACHES
// ==========================================

let MASTER_HERO_LIST = [];
let MASTER_MAP_LIST = [];
let PERSONAL_BUILDS = [];
let MASTER_TIERS = {};
let HOTS_MASTER_DATA = {};

let currentSelectedHeroId = null;
let currentHeroData = null;
let currentBuildIndex = 0;

let builderHeroId = null;
let builderHeroData = null;
let builderSelectedTalents = [1, 1, 1, 1, 1, 1, 1];

const HERO_DATA_CACHE = new Map();


// ==========================================
// 2. STATE HELPERS
// ==========================================

function resetBuilderState(heroId = null, selections = null) {
    builderHeroId = heroId;
    builderHeroData = null;
    builderSelectedTalents = normalizeTalentSelections(selections);
}

function clearHeroDataCache() {
    HERO_DATA_CACHE.clear();
}
