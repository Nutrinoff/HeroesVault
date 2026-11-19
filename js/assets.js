// ==========================================
// ASSET & IMAGE HANDLING MODULE
// ==========================================

const REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';

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

function preloadAllAssets(rawHeroes) {
    if (!Array.isArray(rawHeroes)) return;
    
    // 1. Instantly preload all hero portraits first (lightweight & high priority)
    rawHeroes.forEach(h => {
        const portrait = getHeroPortrait(h);
        if (portrait) {
            new Image().src = getAssetUrl(portrait);
        }
    });

    // 2. Stagger ability icon preloading in the background
    setTimeout(() => {
        rawHeroes.forEach((h, index) => {
            setTimeout(() => {
                const abilities = flattenHeroAbilities(h);
                abilities.forEach(a => {
                    if (a.icon) {
                        new Image().src = getAssetUrl(a.icon);
                    }
                });
            }, index * 30);
        });
    }, 500);
}
