// ==========================================
// 1. HERO LOOKUP & NORMALIZATION
// ==========================================

function normalizeHeroKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function getRawHeroEntry(heroId) {
    if (!heroId) return null;

    if (typeof resolveHeroMasterData === 'function') {
        const resolved = resolveHeroMasterData(heroId);
        if (resolved && typeof resolved === 'object') return resolved;
    }

    const targetKey = normalizeHeroKey(heroId);
    const masterRoot = typeof HOTS_MASTER_DATA !== 'undefined' ? HOTS_MASTER_DATA : null;
    const masterSource = (masterRoot && typeof masterRoot === 'object' && masterRoot.items)
        ? masterRoot.items
        : masterRoot;

    if (Array.isArray(masterSource)) {
        const exact = masterSource.find(
            h => h && typeof h === 'object' && (
                h.id === heroId ||
                h.hyperlinkId === heroId ||
                h.attributeId === heroId
            )
        );
        if (exact) return exact;

        if (targetKey) {
            const matched = masterSource.find(
                h => h && typeof h === 'object' && (
                    normalizeHeroKey(h.id) === targetKey ||
                    normalizeHeroKey(h.hyperlinkId) === targetKey ||
                    normalizeHeroKey(h.attributeId) === targetKey ||
                    normalizeHeroKey(h.name) === targetKey
                )
            );
            if (matched) return matched;
        }
    } else if (masterSource && typeof masterSource === 'object') {
        if (masterSource[heroId] && typeof masterSource[heroId] === 'object') {
            return masterSource[heroId];
        }

        if (targetKey) {
            const entries = Object.entries(masterSource);
            for (let i = 0; i < entries.length; i++) {
                const [key, val] = entries[i];
                if (!val || typeof val !== 'object') continue;
                if (
                    normalizeHeroKey(key) === targetKey ||
                    normalizeHeroKey(val.id) === targetKey ||
                    normalizeHeroKey(val.hyperlinkId) === targetKey ||
                    normalizeHeroKey(val.attributeId) === targetKey ||
                    normalizeHeroKey(val.name) === targetKey
                ) {
                    return val;
                }
            }
        }
    }

    if (typeof MASTER_HERO_LIST !== 'undefined' && Array.isArray(MASTER_HERO_LIST) && targetKey) {
        const listHero = MASTER_HERO_LIST.find(
            h => h && typeof h === 'object' && (
                normalizeHeroKey(h.id) === targetKey ||
                normalizeHeroKey(h.name) === targetKey
            )
        );
        if (listHero) return listHero;
    }

    return null;
}

function normalizeHero(rawHero, fallbackId = '') {
    if (!rawHero || typeof rawHero !== 'object') return null;
    const id = rawHero.id || rawHero.hyperlinkId || rawHero.attributeId || fallbackId;
    if (!id) return null;

    const portraitPath = typeof getHeroPortrait === 'function'
        ? getHeroPortrait(rawHero)
        : (typeof extractPortraitPath === 'function'
            ? extractPortraitPath(rawHero)
            : (rawHero.portrait || ''));

    return {
        id,
        name: rawHero.name || id,
        title: rawHero.title || 'Nexus Combatant',
        role: (Array.isArray(rawHero.roles) && rawHero.roles[0]) || rawHero.role || rawHero.expandedRole || 'Nexus Combatant',
        portrait: portraitPath,
        abilities: typeof flattenHeroAbilities === 'function' ? flattenHeroAbilities(rawHero) : [],
        talents: typeof normalizeTalentTree === 'function'
            ? normalizeTalentTree(rawHero.talents || rawHero.talentTree || {})
            : {}
    };
}

function getNormalizedHeroData(id) {
    if (!id) return null;

    if (typeof HERO_DATA_CACHE !== 'undefined' && HERO_DATA_CACHE instanceof Map) {
        if (HERO_DATA_CACHE.has(id)) return HERO_DATA_CACHE.get(id);
        const normKey = normalizeHeroKey(id);
        if (normKey && HERO_DATA_CACHE.has(normKey)) {
            const cached = HERO_DATA_CACHE.get(normKey);
            HERO_DATA_CACHE.set(id, cached);
            return cached;
        }
    }

    const raw = getRawHeroEntry(id);
    const normalized = normalizeHero(raw, id);
    if (!normalized) return null;

    if (typeof HERO_DATA_CACHE !== 'undefined' && HERO_DATA_CACHE instanceof Map) {
        HERO_DATA_CACHE.set(id, normalized);
        const normKey = normalizeHeroKey(normalized.id || id);
        if (normKey) {
            HERO_DATA_CACHE.set(normKey, normalized);
        }
    }

    return normalized;
}
