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

    // Talent data can have several different nested shapes in the master file.
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

function sortAssetPreloadQueue() {
    ASSET_PRELOAD_QUEUE.sort((a, b) => a.priority - b.priority || a.order - b.order);
}

function pumpAssetPreloadQueue() {
    while (activeAssetPreloads < ASSET_PRELOAD_CONCURRENCY && ASSET_PRELOAD_QUEUE.length) {
        const task = ASSET_PRELOAD_QUEUE.shift();
        if (task.state !== 'queued') continue;

        task.state = 'loading';
        activeAssetPreloads++;
        task.image.onload = () => finishAssetPreload(task, true);
        task.image.onerror = () => finishAssetPreload(task, false);
        task.image.src = task.url;
    }
}

function finishAssetPreload(task, succeeded) {
    if (task.state !== 'loading') return;

    task.state = succeeded ? 'loaded' : 'failed';
    task.image.onload = null;
    task.image.onerror = null;
    task.image = null;
    activeAssetPreloads = Math.max(0, activeAssetPreloads - 1);

    if (!succeeded) ASSET_PRELOAD_CACHE.delete(task.url);
    pumpAssetPreloadQueue();
}

function preloadAssets(paths, priority = 'low') {
    const priorityValue = priority === 'high' ? 0 : 1;
    const urls = Array.from(new Set((paths || []).map(getAssetUrl).filter(Boolean)));

    urls.forEach(url => {
        const existing = ASSET_PRELOAD_CACHE.get(url);
        if (existing) {
            // Promote queued work when a hero is actually visible or selected.
            if (existing.state === 'queued' && priorityValue < existing.priority) {
                existing.priority = priorityValue;
                sortAssetPreloadQueue();
            }
            return;
        }

        const image = new Image();
        image.decoding = 'async';
        if ('fetchPriority' in image) image.fetchPriority = priorityValue === 0 ? 'high' : 'low';

        const task = {
            url,
            image,
            priority: priorityValue,
            order: ASSET_PRELOAD_QUEUE.length,
            state: 'queued'
        };
        ASSET_PRELOAD_CACHE.set(url, task);
        ASSET_PRELOAD_QUEUE.push(task);
    });

    sortAssetPreloadQueue();
    pumpAssetPreloadQueue();
}

function preloadHeroAssets(hero) {
    if (hero) preloadAssets(getHeroAssetPaths(hero), 'high');
}
