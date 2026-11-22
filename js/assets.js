// ==========================================
// ASSET & IMAGE HANDLING MODULE
// ==========================================

const REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';
const KNOWN_ASSET_FOLDERS = ['abilitytalents/', 'heroportraits/', 'loadingscreens/'];

function getAssetUrl(path, fallback = '') {
    if (!path) return fallback;
    if (/^https?:\/\//i.test(path)) return path;

    let p = String(path).trim().replace(/^\.\//, '').replace(/^\/+/, '');
    if (!p) return fallback;

    if (p.includes('/') && KNOWN_ASSET_FOLDERS.some(folder => p.startsWith(folder))) {
        return REPO_BASE + p;
    }

    if (
        p.startsWith('storm_ui_ingame_hero_loadingscreen') ||
        p.startsWith('storm_ui_ingame_hero_select') ||
        p.startsWith('storm_ui_ingame_heroselect') ||
        p.startsWith('storm_ui_ingame_target') ||
        p.startsWith('storm_ui_ingame_leaderboard') ||
        p.includes('portrait')
    ) {
        p = 'heroportraits/' + p;
    } else if (p.includes('loadingscreen') || p.startsWith('loadingscreen')) {
        p = 'loadingscreens/' + p;
    } else {
        p = 'abilitytalents/' + p;
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

function getHeroLoadingPortrait(heroOrRaw) {
    if (!heroOrRaw) return '';

    const raw = typeof heroOrRaw === 'string' && typeof getRawHeroEntry === 'function'
        ? (getRawHeroEntry(heroOrRaw) || {})
        : (heroOrRaw.id && typeof getRawHeroEntry === 'function'
            ? (getRawHeroEntry(heroOrRaw.id) || heroOrRaw)
            : heroOrRaw);

    const loadingPath = raw?.portraits?.loading || raw?.loading || '';
    if (!loadingPath) return '';

    return typeof getAssetUrl === 'function' ? getAssetUrl(loadingPath) : loadingPath;
}
function preloadAllAssets(rawHeroes) {
    if (!Array.isArray(rawHeroes) || rawHeroes.length === 0) return;

    // 1. Instantly preload hero portraits first (lightweight & high priority)
    rawHeroes.forEach(h => {
        const portrait = getHeroPortrait(h);
        if (portrait) {
            const img = new Image();
            img.src = getAssetUrl(portrait);
        }
    });

    // 2. Stagger ability & talent icon preloading in the background
    setTimeout(() => {
        rawHeroes.forEach((h, index) => {
            setTimeout(() => {
                const iconPaths = new Set();

                if (typeof flattenHeroAbilities === 'function') {
                    flattenHeroAbilities(h).forEach(a => {
                        if (a?.icon) iconPaths.add(a.icon);
                    });
                }

                if (typeof normalizeTalentTree === 'function') {
                    const tree = normalizeTalentTree(h.talents || h.talentTree || {});
                    Object.values(tree).forEach(tierList => {
                        if (!Array.isArray(tierList)) return;
                        tierList.forEach(t => {
                            if (t?.icon) iconPaths.add(t.icon);
                        });
                    });
                }

                iconPaths.forEach(icon => {
                    const img = new Image();
                    img.src = getAssetUrl(icon);
                });
            }, index * 30);
        });
    }, 500);
}
