// ==========================================
// ASSET & IMAGE HANDLING MODULE
// ==========================================

const REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';
const ASSET_PRELOAD_CONCURRENCY = 4;
const ASSET_PRELOAD_CACHE = new Map();
const ASSET_PRELOAD_QUEUE = [];
let activeAssetPreloads = 0;

function getAssetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;

    let p = String(path).replace(/^\.\//, '').replace(/^\//, '');
    if (p.includes('/') && ['abilitytalents/', 'heroportraits/', 'loadingscreens/'].some(x => p.startsWith(x))) {
        return REPO_BASE + p;
    }

    if (p.includes('talent') || p.startsWith('storm_ui_icon') || p.includes('ability')) {
        p = 'abilitytalents/' + p;
    } else if (p.includes('hero') || p.includes('portrait') || p.startsWith('ui_') || p.startsWith('storm_ui_ingame')) {
        p = 'heroportraits/' + p;
    }

    return REPO_BASE + p;
}

function getHeroPortrait(hero) {
    if (!hero) return '';
    const p = hero.portraits || {};
    return p.draftScreen
        || p.heroSelect
        || p.leaderboard
        || p.target
        || hero.portrait
        || '';
}

function getHeroAssetPaths(hero) {
    if (!hero || typeof hero !== 'object') return [];

    const paths = new Set();
    const add = value => {
        if (typeof value === 'string' && value.trim()) paths.add(getAssetUrl(value.trim()));
    };

    add(getHeroPortrait(hero));

    // Traverse the talent data as well as normalized ability data. Master-data
    // formats vary, so only string-valued `icon` fields are collected here.
    const visited = new Set();
    const visit = value => {
        if (!value || typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        add(value.icon);
        Object.values(value).forEach(visit);
    };
    visit(hero.talents || hero.talentTree || {});

    if (typeof flattenHeroAbilities === 'function') {
        (flattenHeroAbilities(hero) || []).forEach(ability => add(ability.icon));
    }

    return Array.from(paths).filter(Boolean);
}

function pumpAssetPreloadQueue() {
    while (activeAssetPreloads < ASSET_PRELOAD_CONCURRENCY && ASSET_PRELOAD_QUEUE.length) {
        const task = ASSET_PRELOAD_QUEUE.shift();
        activeAssetPreloads++;
        task.image.onload = task.finish;
        task.image.onerror = task.finish;
        task.image.src = task.url;
    }
}

function preloadAssets(paths, priority = 'low') {
    const urls = Array.from(new Set((paths || []).map(getAssetUrl).filter(Boolean)));

    urls.forEach(url => {
        if (ASSET_PRELOAD_CACHE.has(url)) return;

        const image = new Image();
        image.decoding = 'async';
        if ('fetchPriority' in image) image.fetchPriority = priority === 'high' ? 'high' : 'low';

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            activeAssetPreloads = Math.max(0, activeAssetPreloads - 1);
            pumpAssetPreloadQueue();
        };

        // Keep image references alive until they finish; dropping temporary Image
        // instances immediately can make speculative requests unreliable.
        ASSET_PRELOAD_CACHE.set(url, image);
        ASSET_PRELOAD_QUEUE.push({ image, url, finish });
    });

    pumpAssetPreloadQueue();
}

function preloadHeroAssets(hero) {
    if (!hero) return;
    preloadAssets(getHeroAssetPaths(hero), 'high');
}

function preloadAllAssets(rawHeroes) {
    if (!Array.isArray(rawHeroes) || !rawHeroes.length) return;

    // Warm only the first visible roster portraits immediately. Loading every
    // icon at startup competes with the current view and can delay visible images.
    preloadAssets(rawHeroes.slice(0, 12).map(getHeroPortrait), 'low');

    const preloadRemaining = () => {
        const remainingHeroes = rawHeroes.slice(12);
        const paths = remainingHeroes.flatMap(getHeroAssetPaths);
        preloadAssets(paths, 'low');
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(preloadRemaining, { timeout: 2500 });
    } else {
        window.setTimeout(preloadRemaining, 1200);
    }
}
