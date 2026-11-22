// ==========================================
// ASSET & IMAGE HANDLING MODULE
// ==========================================

var REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';
var KNOWN_ASSET_FOLDERS = ['abilitytalents/', 'heroportraits/', 'loadingscreens/'];

function extractPortraitPath(source) {
    if (!source) return '';
    if (typeof source === 'string') return source.trim();

    var p = source.portraits || {};
    return (
        p.draftScreen ||
        p.heroSelect ||
        p.leaderboard ||
        p.target ||
        source.portrait ||
        source.portraitUrl ||
        source.imageUrl ||
        source.ImageURL ||
        source.icon ||
        ''
    );
}

function getAssetUrl(path, fallback) {
    var safeFallback = fallback || '';
    if (!path) return safeFallback;
    if (/^(https?:\/\/|data:image\/)/i.test(path)) return path;

    var p = String(path).trim().replace(/^\.\//, '').replace(/^\/+/, '');
    if (!p) return safeFallback;

    if (p.indexOf('/') !== -1 && KNOWN_ASSET_FOLDERS.some(function (folder) {
        return p.indexOf(folder) === 0;
    })) {
        return REPO_BASE + p;
    }

    var lower = p.toLowerCase();
    var isPortrait =
        lower.indexOf('storm_ui_ingame_hero_loadingscreen') === 0 ||
        lower.indexOf('storm_ui_ingame_hero_select') === 0 ||
        lower.indexOf('storm_ui_ingame_heroselect') === 0 ||
        lower.indexOf('storm_ui_ingame_target') === 0 ||
        lower.indexOf('storm_ui_ingame_leaderboard') === 0 ||
        lower.indexOf('portrait') !== -1;

    var isLoadingScreen =
        lower.indexOf('loadingscreen') !== -1 ||
        lower.indexOf('loadingscreen') === 0;

    var isAbilityOrTalentIcon =
        lower.indexOf('storm_ui_talent') === 0 ||
        lower.indexOf('storm_ui_icon_') === 0 ||
        lower.indexOf('storm_ui_btn_') === 0;

    if (isPortrait) {
        p = 'heroportraits/' + p;
    } else if (isLoadingScreen) {
        p = 'loadingscreens/' + p;
    } else if (!isAbilityOrTalentIcon && p.indexOf('/') === -1) {
        p = 'heroportraits/' + p;
    } else {
        p = 'abilitytalents/' + p;
    }

    return REPO_BASE + p;
}

function resolveAssetUrl(sourceOrPath, fallback) {
    var safeFallback = fallback || '';
    if (!sourceOrPath) return safeFallback;

    var rawPath = extractPortraitPath(sourceOrPath);
    if (!rawPath) return safeFallback;

    return getAssetUrl(rawPath, safeFallback);
}

// Shared aliases so all modules use the same resolver regardless of load order
var resolvePortraitPath = resolveAssetUrl;
var resolvePortraitUrl = resolveAssetUrl;
var resolveHeroUiPortraitUrl = resolveAssetUrl;

function getHeroPortrait(hero) {
    if (!hero) return '';
    return extractPortraitPath(hero);
}

function getHeroLoadingPortrait(heroOrRaw) {
    if (!heroOrRaw) return '';

    var raw = typeof heroOrRaw === 'string' && typeof getRawHeroEntry === 'function'
        ? (getRawHeroEntry(heroOrRaw) || {})
        : (heroOrRaw.id && typeof getRawHeroEntry === 'function'
            ? (getRawHeroEntry(heroOrRaw.id) || heroOrRaw)
            : heroOrRaw);

    var loadingPath = (raw && raw.portraits && raw.portraits.loading) || (raw && raw.loading) || '';
    if (!loadingPath) return '';

    return getAssetUrl(loadingPath);
}

function preloadAllAssets(rawHeroes) {
    if (!Array.isArray(rawHeroes) || rawHeroes.length === 0) return;

    rawHeroes.forEach(function (h) {
        var portrait = getHeroPortrait(h);
        if (portrait) {
            var img = new Image();
            img.src = getAssetUrl(portrait);
        }
    });

    setTimeout(function () {
        rawHeroes.forEach(function (h, index) {
            setTimeout(function () {
                var iconPaths = new Set();

                if (typeof flattenHeroAbilities === 'function') {
                    flattenHeroAbilities(h).forEach(function (a) {
                        if (a && a.icon) iconPaths.add(a.icon);
                    });
                }

                if (typeof normalizeTalentTree === 'function') {
                    var tree = normalizeTalentTree(h.talents || h.talentTree || {});
                    Object.values(tree).forEach(function (tierList) {
                        if (!Array.isArray(tierList)) return;
                        tierList.forEach(function (t) {
                            if (t && t.icon) iconPaths.add(t.icon);
                        });
                    });
                }

                iconPaths.forEach(function (icon) {
                    var img = new Image();
                    img.src = getAssetUrl(icon);
                });
            }, index * 30);
        });
    }, 500);
}
