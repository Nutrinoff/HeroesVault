// ==========================================
// ASSET & IMAGE HANDLING MODULE
// ==========================================

var REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';
var KNOWN_ASSET_FOLDERS = ['abilitytalents/', 'heroportraits/', 'loadingscreens/'];
var WARMED_ASSET_URLS = new Set();

function extractPortraitPath(source) {
    if (!source) return '';
    if (typeof source === 'string') return source.trim();

    var p = source.portraits || {};
    return (
        p.draftScreen ||
        p.heroSelect ||
        p.leaderboard ||
        p.target ||
        p.loading ||
        source.loading ||
        source.portrait ||
        source.portraitUrl ||
        source.imageUrl ||
        source.ImageURL ||
        source.icon ||
        ''
    );
}

function getAssetUrl(path, fallback) {
    var safeFallback = typeof fallback === 'string' ? fallback : '';
    if (!path) return safeFallback;

    var trimmed = String(path).trim();
    if (!trimmed) return safeFallback;
    if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) return trimmed;

    var p = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
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
        lower.indexOf('loadingscreen') !== -1;

    var isAbilityOrTalentIcon =
        lower.indexOf('storm_ui_talent') === 0 ||
        lower.indexOf('storm_ui_icon_') === 0 ||
        lower.indexOf('storm_ui_btn_') === 0 ||
        lower.indexOf('storm_temp_') === 0 ||
        lower.indexOf('storm_btn_') === 0 ||
        lower.indexOf('btn-') === 0;

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
    var safeFallback = typeof fallback === 'string' ? fallback : '';
    if (!sourceOrPath) return safeFallback;

    var rawPath = extractPortraitPath(sourceOrPath);
    if (!rawPath) return safeFallback;

    return getAssetUrl(rawPath, safeFallback);
}

// Shared aliases so all modules use the same resolver regardless of load order
var resolvePortraitPath = resolveAssetUrl;
var resolvePortraitUrl = resolveAssetUrl;
var resolveHeroUiPortraitUrl = resolveAssetUrl;

function warmSingleAssetUrl(url) {
    if (!url || WARMED_ASSET_URLS.has(url)) return;
    WARMED_ASSET_URLS.add(url);
    var img = new Image();
    img.decoding = 'async';
    img.src = url;
}

function warmAsset(sourceOrPath, fallback) {
    var resolved = resolveAssetUrl(sourceOrPath, fallback || '');
    if (resolved) {
        warmSingleAssetUrl(resolved);
    }
    return resolved;
}

function attachImageFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    imgEl.addEventListener('error', function onError() {
        imgEl.removeEventListener('error', onError);
        if (imgEl.getAttribute('src') !== fallbackUrl) {
            imgEl.src = fallbackUrl;
        }
    });
}

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

function preloadHeroTalentAndAbilityIcons(rawHero) {
    if (!rawHero || typeof rawHero !== 'object') return;

    var iconPaths = new Set();

    if (typeof flattenHeroAbilities === 'function') {
        flattenHeroAbilities(rawHero).forEach(function (a) {
            if (a && a.icon) iconPaths.add(a.icon);
        });
    }

    if (typeof normalizeTalentTree === 'function') {
        var tree = normalizeTalentTree(rawHero.talents || rawHero.talentTree || {});
        Object.values(tree).forEach(function (tierList) {
            if (!Array.isArray(tierList)) return;
            tierList.forEach(function (t) {
                if (t && t.icon) iconPaths.add(t.icon);
            });
        });
    }

    iconPaths.forEach(function (icon) {
        warmSingleAssetUrl(getAssetUrl(icon));
    });
}

function preloadAllAssets(scopedHeroesOrUrls, options) {
    var opts = options || {};
    var maxItems = typeof opts.limit === 'number' ? opts.limit : 24;

    if (!Array.isArray(scopedHeroesOrUrls) || scopedHeroesOrUrls.length === 0) return;

    var targets = scopedHeroesOrUrls.slice(0, maxItems);
    targets.forEach(function (entry) {
        if (!entry) return;
        if (typeof entry === 'string') {
            warmSingleAssetUrl(getAssetUrl(entry));
            return;
        }
        var portrait = getHeroPortrait(entry);
        if (portrait) {
            warmSingleAssetUrl(getAssetUrl(portrait));
        }
        if (opts.includeIcons) {
            preloadHeroTalentAndAbilityIcons(entry);
        }
    });
}
