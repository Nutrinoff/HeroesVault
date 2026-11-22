// ==========================================
// 1. HERO LOOKUP & NORMALIZATION
// ==========================================

function getRawHeroEntry(heroId) {
    if (!heroId) return null;
    if (typeof resolveHeroMasterData === 'function') {
        return resolveHeroMasterData(heroId);
    }
    if (Array.isArray(HOTS_MASTER_DATA)) {
        return HOTS_MASTER_DATA.find(h => (h?.id || h?.hyperlinkId || h?.attributeId) === heroId) || null;
    }
    return HOTS_MASTER_DATA?.[heroId] || null;
}

function normalizeHero(rawHero, fallbackId = '') {
    if (!rawHero) return null;
    const id = rawHero.id || rawHero.hyperlinkId || rawHero.attributeId || fallbackId;
    if (!id) return null;

    return {
        id,
        name: rawHero.name || id,
        title: rawHero.title || 'Nexus Combatant',
        role: (rawHero.roles && rawHero.roles[0]) || rawHero.expandedRole || 'Nexus Combatant',
        portrait: typeof resolvePortraitPath === 'function'
            ? resolvePortraitPath(rawHero)
            : (rawHero.portrait || ''),
        abilities: typeof flattenHeroAbilities === 'function' ? flattenHeroAbilities(rawHero) : [],
        talents: typeof normalizeTalentTree === 'function'
            ? normalizeTalentTree(rawHero.talents || rawHero.talentTree || {})
            : {}
    };
}

function getNormalizedHeroData(id) {
    if (!id) return null;
    if (HERO_DATA_CACHE.has(id)) return HERO_DATA_CACHE.get(id);

    const raw = getRawHeroEntry(id);
    const normalized = normalizeHero(raw, id);
    if (!normalized) return null;

    HERO_DATA_CACHE.set(id, normalized);
    return normalized;
}
