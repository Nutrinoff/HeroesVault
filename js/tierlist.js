// ========================================
// TIER LIST MODULE
// ========================================

const TIER_LEAGUE_LABELS = {
    S: 'Diamond',
    A: 'Platinum',
    B: 'Gold',
    C: 'Silver',
    D: 'Bronze'
};

const TIERLIST_PORTRAIT_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><rect width="110" height="110" fill="#0d0724"/><rect x="1" y="1" width="108" height="108" fill="none" stroke="#38247a" stroke-width="2"/><text x="55" y="64" fill="#9cb6ff" font-family="monospace" font-size="34" text-anchor="middle">?</text></svg>')}`;

let tierRosterIndexCache = {
    sourceRef: null,
    sourceLen: -1,
    byKey: new Map()
};

function toTierHeroKey(value) {
    if (typeof normalizeHeroKey === 'function') {
        return normalizeHeroKey(value);
    }
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function getTierRosterIndex() {
    const roster = Array.isArray(MASTER_HERO_LIST) ? MASTER_HERO_LIST : [];
    if (
        tierRosterIndexCache.sourceRef === roster &&
        tierRosterIndexCache.sourceLen === roster.length
    ) {
        return tierRosterIndexCache.byKey;
    }

    const byKey = new Map();
    for (let i = 0; i < roster.length; i++) {
        const hero = roster[i];
        if (!hero || typeof hero !== 'object') continue;

        const keys = [
            toTierHeroKey(hero.id),
            toTierHeroKey(hero.name),
            toTierHeroKey(String(hero.name || '').split(',')[0])
        ];
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (key && !byKey.has(key)) {
                byKey.set(key, hero);
            }
        }
    }

    tierRosterIndexCache = {
        sourceRef: roster,
        sourceLen: roster.length,
        byKey
    };

    return byKey;
}

function resolveTierHeroEntry(rawEntry) {
    const candidate = typeof rawEntry === 'string'
        ? rawEntry
        : (rawEntry && typeof rawEntry === 'object'
            ? (rawEntry.id || rawEntry.hyperlinkId || rawEntry.attributeId || rawEntry.name || '')
            : '');
    if (!candidate) return null;

    const rosterIndex = getTierRosterIndex();
    const candidateKey = toTierHeroKey(candidate);
    const indexedHero = candidateKey ? (rosterIndex.get(candidateKey) || null) : null;

    const normalized = typeof getNormalizedHeroData === 'function'
        ? getNormalizedHeroData(indexedHero?.id || candidate)
        : null;
    const rawHero = typeof getRawHeroEntry === 'function'
        ? getRawHeroEntry(normalized?.id || indexedHero?.id || candidate)
        : null;

    const lookupKeys = [
        candidateKey,
        toTierHeroKey(normalized?.id),
        toTierHeroKey(normalized?.name),
        toTierHeroKey(rawHero?.id),
        toTierHeroKey(rawHero?.name)
    ];

    let listHero = indexedHero;
    if (!listHero) {
        for (let i = 0; i < lookupKeys.length; i++) {
            const key = lookupKeys[i];
            if (key && rosterIndex.has(key)) {
                listHero = rosterIndex.get(key);
                break;
            }
        }
    }

    const resolvedId = normalized?.id || listHero?.id || rawHero?.id || '';
    const resolvedName = normalized?.name || listHero?.name || rawHero?.name || '';
    const resolvedPortrait = normalized?.portrait || listHero?.portrait || rawHero || '';

    if (!resolvedId && !resolvedName) return null;

    return {
        id: resolvedId || resolvedName,
        name: resolvedName || resolvedId,
        portrait: resolvedPortrait
    };
}

function getTierListFallbackPortrait() {
    if (typeof HERO_FALLBACK_PORTRAIT === 'string' && HERO_FALLBACK_PORTRAIT) {
        return HERO_FALLBACK_PORTRAIT;
    }
    if (typeof HERO_VIEW_ICON_FALLBACK === 'string' && HERO_VIEW_ICON_FALLBACK) {
        return HERO_VIEW_ICON_FALLBACK;
    }
    return TIERLIST_PORTRAIT_FALLBACK;
}

function resolveTierListPortraitUrl(hero) {
    const fallback = getTierListFallbackPortrait();
    if (!hero) return fallback;

    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(hero.id) : null;
    const source = hero.portrait || rawEntry || hero;

    if (typeof resolveAssetUrl === 'function') {
        return resolveAssetUrl(source, fallback);
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(hero.portrait, fallback) || fallback;
    }
    return fallback;
}

function applyTierPortraitFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    if (typeof attachImageFallback === 'function') {
        attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    imgEl.addEventListener('error', function onFallbackError() {
        imgEl.removeEventListener('error', onFallbackError);
        if (imgEl.getAttribute('src') !== fallbackUrl) {
            imgEl.src = fallbackUrl;
        }
    });
}

function createTierHeroButton(hero) {
    const fallback = getTierListFallbackPortrait();
    const portraitUrl = resolveTierListPortraitUrl(hero);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex items-center gap-2 rounded-[2px] border border-[#38247a] bg-[#0c0621]/90 px-2.5 py-1.5 text-xs font-medium text-[#e6ecff] hover:border-[#58baff]/75 hover:bg-[#190e40]/90 transition cursor-pointer';
    btn.addEventListener('click', () => {
        if (typeof navigateTo === 'function') {
            navigateTo('builds', { hero: hero.id });
        } else if (typeof selectHero === 'function') {
            selectHero(hero.id, false);
        }
    });

    const img = document.createElement('img');
    img.alt = `${hero.name || hero.id} portrait`;
    img.className = 'w-7 h-7 rounded-[2px] border border-[#5c42b8]/70 object-cover bg-[#070412] shrink-0';
    img.loading = 'lazy';
    applyTierPortraitFallback(img, fallback);
    img.src = portraitUrl;

    const label = document.createElement('span');
    label.textContent = hero.name || hero.id;

    btn.append(img, label);
    return btn;
}

function renderTierList() {
    const box = document.getElementById('tierlist-rows-container');
    if (!box) return;

    getTierRosterIndex();

    const groups = { S: [], A: [], B: [], C: [], D: [] };
    const seenKeys = new Set();

    Object.entries(MASTER_TIERS || {}).forEach(([k, ids]) => {
        (ids || []).forEach(id => {
            const h = resolveTierHeroEntry(id);
            const t = typeof tierLetter === 'function' ? tierLetter(k) : String(k || 'D').toUpperCase();
            const heroKey = toTierHeroKey(h?.id);
            if (h && heroKey && groups[t] && !seenKeys.has(heroKey)) {
                seenKeys.add(heroKey);
                groups[t].push(h);
            }
        });
    });

    const frag = document.createDocumentFragment();

    Object.entries(groups).forEach(([t, heroes]) => {
        const leagueName = TIER_LEAGUE_LABELS[t] || '';
        const r = document.createElement('section');
        r.className = 'hots-panel flex items-stretch overflow-hidden';

        const tierCell = document.createElement('div');
        tierCell.className = 'hots-subpanel w-32 shrink-0 flex flex-col items-center justify-center border-r border-[#38247a] px-2.5 py-3 gap-1';

        const tierBadge = document.createElement('span');
        tierBadge.className = 'hots-tier-btn is-active text-lg font-black leading-none whitespace-nowrap';
        tierBadge.dataset.tier = t;
        tierBadge.textContent = `${t} Tier`;

        const leagueLabel = document.createElement('span');
        leagueLabel.className = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[#8c83a2]';
        leagueLabel.textContent = leagueName;

        tierCell.append(tierBadge, leagueLabel);

        const heroesWrap = document.createElement('div');
        heroesWrap.className = 'p-3 flex flex-wrap items-center gap-2 min-h-20 flex-1 min-w-0';

        if (heroes.length > 0) {
            heroes.forEach(h => heroesWrap.appendChild(createTierHeroButton(h)));
        } else {
            const empty = document.createElement('span');
            empty.className = 'text-xs text-[#8c83a2] italic';
            empty.textContent = 'No heroes in this tier.';
            heroesWrap.appendChild(empty);
        }

        r.append(tierCell, heroesWrap);
        frag.appendChild(r);
    });

    box.replaceChildren(frag);
}
