// =========================================
// HEROESVAULT CATALOG & INDEX MODULE
// =========================================

(function initHeroesVaultCatalog(global) {
    'use strict';

    const DEFAULT_TIER = 'D';
    const DEFAULT_ROLE = 'Nexus Combatant';

    let catalogCache = {
        signature: '',
        heroes: [],
        byKey: new Map(),
        tierByKey: new Map(),
        searchEntries: [],
        assetByKey: new Map()
    };

    function normalizeKey(value) {
        if (typeof global.normalizeHeroKey === 'function') {
            return global.normalizeHeroKey(value);
        }
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function getRawHeroMapOrList() {
        if (typeof global.getRawHeroEntry === 'function') {
            return null;
        }
        const raw = global.HOTS_MASTER_DATA;
        if (!raw) return null;
        return (typeof raw === 'object' && !Array.isArray(raw) && raw.items) ? raw.items : raw;
    }

    function resolveRawEntry(idOrKey) {
        if (!idOrKey) return null;
        if (typeof global.getRawHeroEntry === 'function') {
            return global.getRawHeroEntry(idOrKey);
        }
        const source = getRawHeroMapOrList();
        if (!source) return null;
        if (Array.isArray(source)) {
            const target = normalizeKey(idOrKey);
            return source.find(item =>
                item &&
                (normalizeKey(item.id) === target ||
                    normalizeKey(item.hyperlinkId) === target ||
                    normalizeKey(item.name) === target)
            ) || null;
        }
        if (typeof source === 'object') {
            if (source[idOrKey] && typeof source[idOrKey] === 'object') return source[idOrKey];
            const target = normalizeKey(idOrKey);
            return Object.entries(source)
                .filter(([key, item]) => key !== 'meta' && item && typeof item === 'object')
                .map(([, item]) => item)
                .find(item =>
                    normalizeKey(item.id) === target ||
                    normalizeKey(item.hyperlinkId) === target ||
                    normalizeKey(item.name) === target
                ) || null;
        }
        return null;
    }

    function resolveNormalizedHero(idOrKey) {
        if (!idOrKey) return null;
        if (typeof global.getNormalizedHeroData === 'function') {
            return global.getNormalizedHeroData(idOrKey);
        }
        if (global.HERO_DATA_CACHE instanceof Map) {
            const direct = global.HERO_DATA_CACHE.get(idOrKey);
            if (direct) return direct;
            const target = normalizeKey(idOrKey);
            for (const val of global.HERO_DATA_CACHE.values()) {
                if (val && (normalizeKey(val.id) === target || normalizeKey(val.name) === target)) {
                    return val;
                }
            }
        }
        return null;
    }

    function resolvePortraitMeta(hero, normHero, rawEntry) {
        const candidate = normHero?.portrait || hero?.portrait || rawEntry || '';
        const url = typeof global.resolveAssetUrl === 'function'
            ? global.resolveAssetUrl(candidate, '')
            : (typeof candidate === 'string' ? candidate : '');

        return {
            source: candidate,
            url
        };
    }

    function resolveTierForHero(resolvedId, aliases, tiersObj) {
        if (typeof global.getHeroTier === 'function') {
            const t = global.getHeroTier(resolvedId);
            if (t) return String(t).toUpperCase();
        }
        if (tiersObj && typeof tiersObj === 'object') {
            for (const [tierKey, list] of Object.entries(tiersObj)) {
                if (!Array.isArray(list)) continue;
                for (const entry of list) {
                    const normalizedEntry = normalizeKey(
                        typeof entry === 'string' ? entry : (entry?.id || entry?.name || '')
                    );
                    if (normalizedEntry && aliases.has(normalizedEntry)) {
                        return String(tierKey).toUpperCase();
                    }
                }
            }
        }
        return DEFAULT_TIER;
    }

    function buildCatalogSignature(roster, tiersObj, cacheMap) {
        const list = Array.isArray(roster) ? roster : [];
        const rosterSig = list
            .map(h => {
                if (!h || typeof h !== 'object') return '';
                return [
                    h.id || '',
                    h.name || '',
                    h.role || '',
                    h.portrait || ''
                ].join(':');
            })
            .join('|');

        let tiersSig = '';
        if (tiersObj && typeof tiersObj === 'object') {
            tiersSig = Object.entries(tiersObj)
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 0}`)
                .join(',');
        }

        const cacheSize = cacheMap instanceof Map ? cacheMap.size : 0;
        return `${list.length}#${cacheSize}#${tiersSig}#${rosterSig}`;
    }

    function rebuildCatalogIfNeeded(force = false) {
        const roster = Array.isArray(global.MASTER_HERO_LIST) ? global.MASTER_HERO_LIST : [];
        const tiersObj = global.MASTER_TIERS && typeof global.MASTER_TIERS === 'object'
            ? global.MASTER_TIERS
            : null;
        const cacheMap = global.HERO_DATA_CACHE instanceof Map ? global.HERO_DATA_CACHE : null;

        const signature = buildCatalogSignature(roster, tiersObj, cacheMap);
        if (!force && signature === catalogCache.signature && catalogCache.heroes.length > 0) {
            return catalogCache;
        }

        const byKey = new Map();
        const tierByKey = new Map();
        const assetByKey = new Map();
        const searchEntries = [];
        const indexedHeroes = [];

        for (const hero of roster) {
            if (!hero || typeof hero !== 'object') continue;

            const normHero = resolveNormalizedHero(hero.id);
            const resolvedId = String(normHero?.id || hero.id || '').trim();
            const displayName = String(normHero?.name || hero.name || resolvedId || 'Hero').trim();
            const role = String(normHero?.role || hero.role || DEFAULT_ROLE).trim();

            const aliases = new Set(
                [hero.id, hero.name, resolvedId, normHero?.name]
                    .map(normalizeKey)
                    .filter(Boolean)
            );

            const rawEntry = resolveRawEntry(resolvedId || hero.id);
            const portraitMeta = resolvePortraitMeta(hero, normHero, rawEntry);
            const tier = resolveTierForHero(resolvedId, aliases, tiersObj);

            const record = {
                id: resolvedId,
                name: displayName,
                role,
                tier,
                portrait: portraitMeta.url,
                portraitMeta,
                rawHero: hero,
                normHero,
                aliases: Array.from(aliases),
                searchLower: [hero.searchText, hero.name, hero.id, normHero?.name, normHero?.id, role]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase(),
                searchNorm: normalizeKey([hero.name, hero.id, normHero?.name, role].filter(Boolean).join(' '))
            };

            indexedHeroes.push(record);
            searchEntries.push(record);

            for (const key of aliases) {
                if (!byKey.has(key)) {
                    byKey.set(key, record);
                }
                if (!tierByKey.has(key)) {
                    tierByKey.set(key, tier);
                }
                if (!assetByKey.has(key)) {
                    assetByKey.set(key, portraitMeta);
                }
            }
        }

        catalogCache = {
            signature,
            heroes: indexedHeroes,
            byKey,
            tierByKey,
            searchEntries,
            assetByKey
        };

        return catalogCache;
    }

    function getHero(idOrName) {
        if (!idOrName) return null;
        const cat = rebuildCatalogIfNeeded();
        return cat.byKey.get(normalizeKey(idOrName)) || null;
    }

    function getTier(idOrName) {
        if (!idOrName) return DEFAULT_TIER;
        const cat = rebuildCatalogIfNeeded();
        return cat.tierByKey.get(normalizeKey(idOrName)) || DEFAULT_TIER;
    }

    function getAssetMeta(idOrName) {
        if (!idOrName) return { source: '', url: '' };
        const cat = rebuildCatalogIfNeeded();
        return cat.assetByKey.get(normalizeKey(idOrName)) || { source: '', url: '' };
    }

    function searchHeroes({ query = '', role = '', tier = '' } = {}) {
        const cat = rebuildCatalogIfNeeded();
        const qLower = String(query || '').trim().toLowerCase();
        const qNorm = normalizeKey(query);
        const roleFilter = String(role || '').trim().toLowerCase();
        const tierFilter = String(tier || '').trim().toUpperCase();

        return cat.searchEntries.filter(entry => {
            if (roleFilter && roleFilter !== 'all' && entry.role.toLowerCase() !== roleFilter) {
                return false;
            }
            if (tierFilter && tierFilter !== 'ALL' && entry.tier !== tierFilter) {
                return false;
            }
            if (!qLower) return true;
            if (entry.searchLower.includes(qLower)) return true;
            if (!qNorm) return false;
            return entry.searchNorm.includes(qNorm) || entry.aliases.some(k => k.includes(qNorm));
        });
    }

    global.HeroesVaultCatalog = {
        rebuild: force => rebuildCatalogIfNeeded(Boolean(force)),
        getAllHeroes: () => rebuildCatalogIfNeeded().heroes,
        getHero,
        getTier,
        getTierMap: () => rebuildCatalogIfNeeded().tierByKey,
        getAssetMeta,
        searchHeroes,
        normalizeKey
    };
})(window);
