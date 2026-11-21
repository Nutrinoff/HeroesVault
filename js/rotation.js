// ==========================================
// NEXUS ROTATION MODULE (F2P HEROES & MAPS)
// ==========================================

const NEXUS_ROTATION_API_URL = 'https://nexuscompendium.com/api/currently/herorotation+bgrotation';
const ROTATION_PROXY_URL = ''; // Set to your CORS-enabled Worker/proxy URL, e.g. 'https://hots-rotation-proxy.your-name.workers.dev'
const LOCAL_ROTATION_FALLBACK_URL = './data/rotation.json';
const ROTATION_FETCH_TIMEOUT_MS = 5000;

const HERO_PORTRAITS_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/heroportraits/';
const FALLBACK_PORTRAIT_DATA_URI =
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

function isLocalHostname() {
    const host = window.location?.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function toHeroPortraitUrl(rawPath) {
    if (!rawPath) return '';
    const trimmed = String(rawPath).trim();
    if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) {
        return trimmed;
    }

    const cleaned = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
    if (!cleaned) return '';

    if (cleaned.startsWith('heroportraits/')) {
        return `https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/${cleaned}`;
    }

    if (cleaned.includes('/')) {
        if (typeof getAssetUrl === 'function') {
            return getAssetUrl(cleaned);
        }
        return `https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/${cleaned}`;
    }

    return HERO_PORTRAITS_BASE + cleaned;
}

function extractPortraitCandidate(heroObj) {
    if (!heroObj) return '';
    if (typeof getHeroPortrait === 'function') {
        const p = getHeroPortrait(heroObj);
        if (p) return p;
    }
    const portraits = heroObj.portraits || {};
    return (
        portraits.draftScreen ||
        portraits.heroSelect ||
        portraits.leaderboard ||
        portraits.target ||
        heroObj.portrait ||
        heroObj.portraitUrl ||
        heroObj.ImageURL ||
        heroObj.imageUrl ||
        heroObj.icon ||
        ''
    );
}

function buildHeroLookupIndex() {
    const index = new Map();
    const roster = Array.isArray(window.MASTER_HERO_LIST) ? window.MASTER_HERO_LIST : [];

    for (const hero of roster) {
        if (!hero) continue;
        const keys = [
            normalizeSlugKey(hero.id),
            normalizeSlugKey(hero.name),
            normalizeSlugKey(String(hero.name || '').split(',')[0])
        ].filter(Boolean);

        for (const key of keys) {
            if (!index.has(key)) {
                index.set(key, hero);
            }
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
        const keys = [
            normalizeSlugKey(hero.id),
            normalizeSlugKey(hero.hyperlinkId),
            normalizeSlugKey(hero.attributeId),
            normalizeSlugKey(hero.name),
            normalizeSlugKey(String(hero.name || '').split(',')[0])
        ].filter(Boolean);

        for (const key of keys) {
            if (!index.has(key)) {
                index.set(key, hero);
            }
        }
    }

    return index;
}

function buildMapLookupIndex() {
    const index = new Map();
    const maps = Array.isArray(window.MASTER_MAP_LIST) ? window.MASTER_MAP_LIST : [];

    for (const mapItem of maps) {
        if (!mapItem) continue;
        const mapId = mapItem.id || mapItem.mapId;
        const keys = [
            normalizeSlugKey(mapId),
            normalizeSlugKey(mapItem.name)
        ].filter(Boolean);

        for (const key of keys) {
            if (!index.has(key)) {
                index.set(key, mapItem);
            }
        }
    }

    return index;
}

function matchHeroWithIndex(apiHero, heroIndex, rawMasterIndex) {
    const rawName = apiHero?.Name || apiHero?.name || '';
    const rawId = apiHero?.ID || apiHero?.id || '';
    const keys = [
        normalizeSlugKey(rawId),
        normalizeSlugKey(rawName),
        normalizeSlugKey(rawName.split(',')[0])
    ].filter(Boolean);

    let matched = null;
    let rawMaster = null;

    for (const key of keys) {
        if (!matched && heroIndex.has(key)) matched = heroIndex.get(key);
        if (!rawMaster && rawMasterIndex.has(key)) rawMaster = rawMasterIndex.get(key);
    }

    const fallbackName = rawName || rawId || 'Unknown Hero';
    const rawPortrait =
        extractPortraitCandidate(rawMaster) ||
        extractPortraitCandidate(matched) ||
        extractPortraitCandidate(apiHero);

    const portraitUrl = toHeroPortraitUrl(rawPortrait) || FALLBACK_PORTRAIT_DATA_URI;

    return {
        id: matched?.id || rawMaster?.id || rawMaster?.hyperlinkId || rawId || normalizeSlugKey(fallbackName),
        name: matched?.name || rawMaster?.name || fallbackName,
        role: matched?.role || (rawMaster?.roles && rawMaster.roles[0]) || rawMaster?.expandedRole || 'Free Rotation',
        portraitUrl,
        reqLevel: apiHero?.ReqLevel ?? apiHero?.reqLevel ?? null
    };
}

function matchMapWithIndex(apiMap, mapIndex) {
    const rawName = apiMap?.Name || apiMap?.name || '';
    const rawId = apiMap?.ID || apiMap?.id || '';
    const keys = [
        normalizeSlugKey(rawId),
        normalizeSlugKey(rawName)
    ].filter(Boolean);

    let matched = null;
    for (const key of keys) {
        if (mapIndex.has(key)) {
            matched = mapIndex.get(key);
            break;
        }
    }

    const matchedId = matched ? (matched.id || matched.mapId) : null;

    return {
        id: matchedId || rawId || normalizeSlugKey(rawName),
        name: matched?.name || rawName || rawId || 'Battleground',
        inApp: Boolean(matched && matchedId)
    };
}

function parseRotationPayload(raw) {
    const sourceTag = raw?._source || 'none';
    const root = raw?.data && typeof raw.data === 'object' ? raw.data : (raw || {});
    const heroBlock = root.RotationHero || root.rotationHero || {};
    const bgBlock = root.RotationBattleground || root.rotationBattleground || {};

    const heroIndex = buildHeroLookupIndex();
    const rawMasterIndex = buildRawMasterLookupIndex();
    const mapIndex = buildMapLookupIndex();

    const rawHeroes = Array.isArray(heroBlock.Heroes)
        ? heroBlock.Heroes
        : (Array.isArray(heroBlock.heroes) ? heroBlock.heroes : []);

    const heroes = rawHeroes.map(h => matchHeroWithIndex(h, heroIndex, rawMasterIndex));

    const timespan =
        heroBlock.Timespan ||
        heroBlock.timespan ||
        [heroBlock.StartDate, heroBlock.EndDate].filter(Boolean).join(' – ') ||
        'Weekly Rotation';

    const allHeroesFree = Boolean(heroBlock.AllHeroesFree ?? heroBlock.allHeroesFree);

    const extractModeList = modeKey => {
        const bucket = bgBlock?.[modeKey] || bgBlock?.[modeKey.toLowerCase()];
        const list = Array.isArray(bucket?.Battlegrounds)
            ? bucket.Battlegrounds
            : (Array.isArray(bucket?.battlegrounds) ? bucket.battlegrounds : []);
        return list.map(m => matchMapWithIndex(m, mapIndex));
    };

    const modes = {
        Ranked: extractModeList('Ranked'),
        Unranked: extractModeList('Unranked'),
        ARAM: extractModeList('ARAM')
    };

    const flatFallback = Array.isArray(bgBlock.Battlegrounds)
        ? bgBlock.Battlegrounds.map(m => matchMapWithIndex(m, mapIndex))
        : (Array.isArray(bgBlock.battlegrounds) ? bgBlock.battlegrounds.map(m => matchMapWithIndex(m, mapIndex)) : []);

    return {
        heroes,
        timespan,
        allHeroesFree,
        modes,
        flatFallback,
        source: sourceTag
    };
}

async function fetchRotationJson(url, timeoutMs = ROTATION_FETCH_TIMEOUT_MS) {
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

function createFreeHeroCard(hero) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hots-subpanel hover:border-cyan-400/70 p-2.5 rounded flex flex-col items-center text-center gap-2 transition cursor-pointer group';
    btn.title = `View ${hero.name} builds`;
    btn.addEventListener('click', () => {
        if (typeof navigateTo === 'function') {
            navigateTo('builds', { hero: hero.id });
        }
    });

    const frame = document.createElement('div');
    frame.className = 'hex-sidebar-frame';

    const img = document.createElement('img');
    img.src = hero.portraitUrl || FALLBACK_PORTRAIT_DATA_URI;
    img.alt = `${hero.name} portrait`;
    img.className = 'hex-sidebar-img';
    img.loading = 'eager';
    img.addEventListener('error', () => {
        if (img.src !== FALLBACK_PORTRAIT_DATA_URI) {
            img.src = FALLBACK_PORTRAIT_DATA_URI;
        }
    });

    const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ringSvg.setAttribute('class', 'hex-sidebar-ring');
    ringSvg.setAttribute('viewBox', '0 0 100 100');
    ringSvg.setAttribute('aria-hidden', 'true');

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'rgba(41, 197, 255, 0.85)');
    poly.setAttribute('stroke-width', '4.5');
    poly.setAttribute('stroke-linejoin', 'round');
    ringSvg.appendChild(poly);

    frame.append(img, ringSvg);

    const textWrap = document.createElement('div');
    textWrap.className = 'w-full min-w-0';

    const nameEl = document.createElement('div');
    nameEl.className = 'text-xs font-bold text-white group-hover:text-cyan-300 truncate';
    nameEl.textContent = hero.name;

    const badgeEl = document.createElement('div');
    badgeEl.className = 'text-[10px] font-mono text-amber-300/90 mt-0.5';
    badgeEl.textContent = hero.reqLevel ? `Lv ${hero.reqLevel}+` : 'F2P';

    textWrap.append(nameEl, badgeEl);
    btn.append(frame, textWrap);
    return btn;
}

function renderFreeRotationHeroes(data) {
    const grid = document.getElementById('home-f2p-grid');
    const spanEl = document.getElementById('home-f2p-timespan');
    if (!grid) return;

    const sourceSuffix = data.source === 'fallback' ? ' · Local Cache' : '';
    const freeSuffix = data.allHeroesFree ? ' · All Heroes Free' : '';

    if (spanEl) {
        spanEl.textContent = `${data.timespan}${freeSuffix}${sourceSuffix}`;
    }

    const displayHeroes = (data.heroes || []).slice(0, 10);
    if (!displayHeroes.length) {
        grid.innerHTML = '<div class="col-span-full text-xs text-violet-200/70 py-3">No free rotation heroes available right now.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    for (const hero of displayHeroes) {
        frag.appendChild(createFreeHeroCard(hero));
    }
    grid.replaceChildren(frag);
}

function createMapChipButton(mapItem) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2.5 py-1 rounded-sm text-xs font-semibold bg-[#180c38] hover:bg-[#241254] text-violet-100 hover:text-cyan-200 border border-[#3a207d] hover:border-cyan-400/60 transition cursor-pointer';
    btn.textContent = mapItem.name;
    btn.addEventListener('click', () => {
        if (typeof navigateTo !== 'function') return;
        if (mapItem.inApp && mapItem.id) {
            navigateTo('map', { id: mapItem.id });
        } else {
            navigateTo('map');
        }
    });
    return btn;
}

function renderBattlegroundRotation(data) {
    const container = document.getElementById('home-bg-rotation');
    if (!container) return;

    const modeEntries = Object.entries(data.modes || {})
        .filter(([, list]) => Array.isArray(list) && list.length > 0);

    if (modeEntries.length > 0) {
        const frag = document.createDocumentFragment();

        for (const [modeName, maps] of modeEntries) {
            const section = document.createElement('div');
            section.className = 'space-y-1.5';

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between text-[11px]';

            const title = document.createElement('span');
            title.className = 'font-bold uppercase tracking-wider text-amber-300';
            title.textContent = modeName;

            const count = document.createElement('span');
            count.className = 'font-mono text-violet-300/70';
            count.textContent = `${maps.length} Maps`;

            header.append(title, count);

            const chipRow = document.createElement('div');
            chipRow.className = 'flex flex-wrap gap-1.5';
            for (const mapItem of maps) {
                chipRow.appendChild(createMapChipButton(mapItem));
            }

            section.append(header, chipRow);
            frag.appendChild(section);
        }

        container.replaceChildren(frag);
        return;
    }

    if (Array.isArray(data.flatFallback) && data.flatFallback.length > 0) {
        const chipRow = document.createElement('div');
        chipRow.className = 'flex flex-wrap gap-1.5';
        for (const mapItem of data.flatFallback) {
            chipRow.appendChild(createMapChipButton(mapItem));
        }
        container.replaceChildren(chipRow);
        return;
    }

    container.innerHTML = '<div class="text-xs text-violet-200/70 py-2">Battleground rotation unavailable right now.</div>';
}

function getRotationFetchCandidates() {
    const candidates = [];
    const proxyUrl = typeof ROTATION_PROXY_URL === 'string' ? ROTATION_PROXY_URL.trim() : '';

    if (proxyUrl) {
        candidates.push({ url: proxyUrl, source: 'proxy' });
    } else if (isLocalHostname()) {
        candidates.push({ url: NEXUS_ROTATION_API_URL, source: 'live-local' });
    }

    candidates.push({ url: LOCAL_ROTATION_FALLBACK_URL, source: 'fallback' });
    return candidates;
}

async function loadAndRenderRotation() {
    let rawPayload = null;

    for (const candidate of getRotationFetchCandidates()) {
        try {
            const json = await fetchRotationJson(candidate.url);
            if (json && typeof json === 'object') {
                rawPayload = { ...json, _source: candidate.source };
                break;
            }
        } catch (_) {
            // Try next candidate source
        }
    }

    currentRotationData = parseRotationPayload(rawPayload || { _source: 'none' });
    renderFreeRotationHeroes(currentRotationData);
    renderBattlegroundRotation(currentRotationData);
}
