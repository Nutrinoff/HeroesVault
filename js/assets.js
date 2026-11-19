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
