// ==========================================
// NEXUS ROTATION MODULE (JSON SCHEDULE READER)
// ==========================================

const LOCAL_ROTATION_DATA_URL = './data/rotation.json';
const ROTATION_FETCH_TIMEOUT_MS = 4000;

const HERO_SLUG_ALIASES = {
    deckardcain: 'deckard',
    deckard: 'deckardcain'
};

const FALLBACK_ROTATION_PORTRAIT =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" fill="#160b33"/>' +
        '<polygon points="32,6 56,19 56,45 32,58 8,45 8,19" fill="#251354" stroke="#24c6ff" stroke-width="2"/>' +
        '<text x="32" y="38" text-anchor="middle" fill="#f4b41a" font-family="sans-serif" font-size="16" font-weight="bold">H</text>' +
        '</svg>'
    );

let currentRotationData = null;

function normalizeSlugKey(val) {
    return String(val || '')
        .toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/[^a-z0-9]/g, '');
}

function expandSlugKeys(rawKeys) {
    const expanded = [];
    for (const key of rawKeys) {
        if (!key) continue;
        if (!expanded.includes(key)) expanded.push(key);
        const alias = HERO_SLUG_ALIASES[key];
        if (alias && !expanded.includes(alias)) {
            expanded.push(alias);
        }
    }
    return expanded;
}

function parseDateBoundary(val, isEndOfDay = false) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
        return new Date(val.getTime());
    }

    const str = String(val).trim();
    const isoDayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (isoDayMatch) {
        const year = Number(isoDayMatch[1]);
        const month = Number(isoDayMatch[2]) - 1;
        const day = Number(isoDayMatch[3]);
        return isEndOfDay
            ? new Date(year, month, day, 23, 59, 59, 999)
            : new Date(year, month, day, 0, 0, 0, 0);
    }

    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return null;
    if (isEndOfDay && !str.includes('T') && !str.includes(':')) {
        parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
}

function pickActiveScheduleEntry(list, now = new Date()) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const nowMs = now.getTime();

    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const start = parseDateBoundary(entry.startDate || entry.StartDate, false);
        const end = parseDateBoundary(entry.endDate || entry.EndDate, true);

        const afterStart = !start || nowMs >= start.getTime();
        const beforeEnd = !end || nowMs <= end.getTime();
        if ((start || end) && afterStart && beforeEnd) {
            return entry;
        }
    }

    return null;
}

function resolvePortraitUrl(rawPath) {
    if (!rawPath) return '';
    if (typeof getAssetUrl === 'function') {
        const url = getAssetUrl(rawPath);
        if (!url) return '';

        const cleaned = String(rawPath).trim().replace(/^\.\//, '').replace(/^\/+/, '');
        if (
            !cleaned.includes('/') &&
            url.includes('/heroesimages/abilitytalents/') &&
            !cleaned.startsWith('storm_ui_talent') &&
            !cleaned.startsWith('storm_ui_icon_')
        ) {
            return url.replace('/heroesimages/abilitytalents/', '/heroesimages/heroportraits/');
        }
        return url;
    }

    const trimmed = String(rawPath).trim();
    if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) return trimmed;
    const cleaned = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('heroportraits/') || cleaned.includes('/')) {
        return `https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/${cleaned}`;
    }
    return `https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/heroportraits/${cleaned}`;
}

function extractPortraitPath(heroObj) {
    if (!heroObj) return '';
    if (typeof getHeroPortrait === 'function') {
        const fromHelper = getHeroPortrait(heroObj);
        if (fromHelper) return fromHelper;
    }
    const p = heroObj.portraits || {};
    return (
        p.draftScreen ||
        p.heroSelect ||
        p.leaderboard ||
        p.target ||
        heroObj.portrait ||
        heroObj.portraitUrl ||
        heroObj.imageUrl ||
        heroObj.ImageURL ||
        heroObj.icon ||
        ''
    );
}

function buildHeroLookupIndex() {
    const index = new Map();
    const roster = Array.isArray(window.MASTER_HERO_LIST) ? window.MASTER_HERO_LIST : [];

    for (const hero of roster) {
        if (!hero) continue;
        const keys = expandSlugKeys([
            normalizeSlugKey(hero.id),
            normalizeSlugKey(hero.name),
            normalizeSlugKey(String(hero.name || '').split(',')[0])
        ]);

        for (const key of keys) {
            if (!index.has(key)) index.set(key, hero);
        }
    }

    return index;
}

function buildRawMasterLookupIndex() {
    const index = new Map();
    const source = window.HOTS_MASTER_DATA;
    const entries = Array.isArray(source)
        ? source
        : (source && typeof source === 'object' ? Object.values(source) : []);

    for (const hero of entries) {
        if (!hero) continue;
        const keys = expandSlugKeys([
            normalizeSlugKey(hero.id),
            normalizeSlugKey(hero.hyperlinkId),
            normalizeSlugKey(hero.attributeId),
            normalizeSlugKey(hero.name),
            normalizeSlugKey(String(hero.name || '').split(',')[0])
        ]);

        for (const key of keys) {
            if (!index.has(key)) index.set(key, hero);
        }
    }

    return index;
}

function matchHeroWithIndex(entry, heroIndex, rawMasterIndex) {
    const item = typeof entry === 'string' ? { name: entry, id: entry } : (entry || {});
    const rawName = item.Name || item.name || '';
    const rawId = item.ID || item.id || '';

    const keys = expandSlugKeys([
        normalizeSlugKey(rawId),
        normalizeSlugKey(rawName),
        normalizeSlugKey(rawName.split(',')[0])
    ]);

    let matched = null;
    let rawMaster = null;

    for (const key of keys) {
        if (!matched && heroIndex.has(key)) matched = heroIndex.get(key);
        if (!rawMaster && rawMasterIndex.has(key)) rawMaster = rawMasterIndex.get(key);
        if (matched && rawMaster) break;
    }

    let resolvedId =
        matched?.id ||
        rawMaster?.id ||
        rawMaster?.hyperlinkId ||
        rawId ||
        normalizeSlugKey(rawName);

    if (!matched && typeof resolveHeroMasterData === 'function') {
        for (const candidate of [resolvedId, ...keys]) {
            if (!candidate) continue;
            const viaResolver = resolveHeroMasterData(candidate);
            if (viaResolver) {
                matched = viaResolver;
                resolvedId = matched.id || candidate;
                break;
            }
        }
    }

    const fallbackName = rawName || rawId || 'Unknown Hero';
    const rawPortrait =
        extractPortraitPath(matched) ||
        extractPortraitPath(rawMaster) ||
        extractPortraitPath(item);

    return {
        id: resolvedId || normalizeSlugKey(fallbackName),
        name: matched?.name || rawMaster?.name || fallbackName,
        role:
            matched?.role ||
            (Array.isArray(matched?.roles) && matched.roles[0]) ||
            matched?.expandedRole ||
            (Array.isArray(rawMaster?.roles) && rawMaster.roles[0]) ||
            rawMaster?.expandedRole ||
            'Free Rotation',
        portraitUrl: resolvePortraitUrl(rawPortrait) || FALLBACK_ROTATION_PORTRAIT,
        reqLevel: item.ReqLevel ?? item.reqLevel ?? null
    };
}

function resolveHeroBlockFromJson(root, now = new Date()) {
    const scheduleList = Array.isArray(root.rotations)
        ? root.rotations
        : (Array.isArray(root.Rotations)
            ? root.Rotations
            : (Array.isArray(root.schedule)
                ? root.schedule
                : (Array.isArray(root.Schedule) ? root.Schedule : null)));

    const activeSlot = pickActiveScheduleEntry(scheduleList, now);
    if (activeSlot) {
        return {
            heroes: Array.isArray(activeSlot.heroes)
                ? activeSlot.heroes
                : (Array.isArray(activeSlot.Heroes) ? activeSlot.Heroes : []),
            timespan:
                activeSlot.timespan ||
                activeSlot.Timespan ||
                activeSlot.label ||
                [activeSlot.startDate || activeSlot.StartDate, activeSlot.endDate || activeSlot.EndDate]
                    .filter(Boolean)
                    .join(' – ') ||
                'Current Rotation',
            allHeroesFree: Boolean(activeSlot.allHeroesFree ?? activeSlot.AllHeroesFree)
        };
    }

    const fallbackBlock = root.RotationHero || root.rotationHero || root.current || {};
    const fallbackHeroes = Array.isArray(fallbackBlock.Heroes)
        ? fallbackBlock.Heroes
        : (Array.isArray(fallbackBlock.heroes) ? fallbackBlock.heroes : []);

    return {
        heroes: fallbackHeroes,
        timespan:
            fallbackBlock.Timespan ||
            fallbackBlock.timespan ||
            [fallbackBlock.StartDate, fallbackBlock.EndDate].filter(Boolean).join(' – ') ||
            'Weekly Rotation',
        allHeroesFree: Boolean(fallbackBlock.AllHeroesFree ?? fallbackBlock.allHeroesFree)
    };
}

function parseRotationPayload(raw, now = new Date()) {
    const root = raw && typeof raw === 'object' ? (raw.data && typeof raw.data === 'object' ? raw.data : raw) : {};
    const heroIndex = buildHeroLookupIndex();
    const rawMasterIndex = buildRawMasterLookupIndex();
    const heroBlock = resolveHeroBlockFromJson(root, now);
    const heroes = (heroBlock.heroes || []).map(h => matchHeroWithIndex(h, heroIndex, rawMasterIndex));

    return {
        heroes,
        timespan: heroBlock.timespan,
        allHeroesFree: heroBlock.allHeroesFree
    };
}

async function fetchLocalRotationJson(url = LOCAL_ROTATION_DATA_URL, timeoutMs = ROTATION_FETCH_TIMEOUT_MS) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function sortRotationHeroesF2pFirst(heroes) {
    return [...heroes].sort((a, b) => {
        const aIsLvl = String(a?.reqLevel || '').trim().toUpperCase() === 'LVL' ? 1 : 0;
        const bIsLvl = String(b?.reqLevel || '').trim().toUpperCase() === 'LVL' ? 1 : 0;
        return aIsLvl - bIsLvl;
    });
}

function createFreeHeroRow(hero) {
    const isLvlSlot = String(hero.reqLevel || '').trim().toUpperCase() === 'LVL';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isLvlSlot
        ? 'f2p-row-item f2p-row-lvl group'
        : 'f2p-row-item group';
    btn.title = isLvlSlot
        ? `${hero.name} — Unlocked rotation slot (Account Level 5, 10, 15, or 20)`
        : `View ${hero.name} builds`;
    btn.addEventListener('click', () => {
        if (typeof navigateTo === 'function') {
            navigateTo('builds', { hero: hero.id });
        }
    });

    const frame = document.createElement('div');
    frame.className = 'hex-sidebar-frame !w-9 !h-9';

    const img = document.createElement('img');
    img.src = hero.portraitUrl || FALLBACK_ROTATION_PORTRAIT;
    img.alt = `${hero.name} portrait`;
    img.className = 'hex-sidebar-img';
    img.loading = 'eager';
    img.addEventListener(
        'error',
        () => {
            if (img.src !== FALLBACK_ROTATION_PORTRAIT) {
                img.src = FALLBACK_ROTATION_PORTRAIT;
            }
        },
        { once: true }
    );

    const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ringSvg.setAttribute('class', 'hex-sidebar-ring');
    ringSvg.setAttribute('viewBox', '0 0 100 100');
    ringSvg.setAttribute('aria-hidden', 'true');

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', isLvlSlot ? 'rgba(244, 63, 94, 0.85)' : 'rgba(41, 197, 255, 0.85)');
    poly.setAttribute('stroke-width', '4.5');
    poly.setAttribute('stroke-linejoin', 'round');
    ringSvg.appendChild(poly);

    frame.append(img, ringSvg);

    const nameEl = document.createElement('span');
    nameEl.className = 'w-full text-[11px] font-semibold text-slate-100 group-hover:text-cyan-300 truncate leading-tight';
    nameEl.textContent = hero.name;

    const badgeEl = document.createElement('span');
    badgeEl.className = isLvlSlot
        ? 'text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-sm bg-rose-500/15 text-rose-400 border border-rose-500/35'
        : 'text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-sm bg-cyan-500/15 text-cyan-300 border border-cyan-400/35';
    badgeEl.textContent = isLvlSlot
        ? 'LVL'
        : (hero.reqLevel ? `Lv ${hero.reqLevel}+` : 'F2P');

    btn.append(frame, nameEl, badgeEl);
    return btn;
}
