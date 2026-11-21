// ==========================================
// NEXUS ROTATION MODULE (F2P HEROES & MAPS)
// ==========================================

const NEXUS_ROTATION_API_URL = 'https://nexuscompendium.com/api/currently/herorotation+bgrotation';
const ROTATION_PROXY_URL = ''; // Set to your deployed Worker URL, e.g. 'https://hots-rotation-proxy.your-name.workers.dev'
const LOCAL_ROTATION_FALLBACK_URL = './data/rotation.json';
const ROTATION_FETCH_TIMEOUT_MS = 4500;
const FALLBACK_ROTATION_PORTRAIT = 'https://via.placeholder.com/56?text=H';

let currentRotationData = null;

function normalizeSlugKey(val) {
    return String(val || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function isLocalHostname() {
    const host = window.location?.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function buildHeroLookupIndex() {
    const index = new Map();
    const roster = Array.isArray(window.MASTER_HERO_LIST) ? window.MASTER_HERO_LIST : [];

    for (const hero of roster) {
        if (!hero) continue;
        const idKey = normalizeSlugKey(hero.id);
        const nameKey = normalizeSlugKey(hero.name);
        if (idKey && !index.has(idKey)) index.set(idKey, hero);
        if (nameKey && !index.has(nameKey)) index.set(nameKey, hero);
    }

    return index;
}

function buildMapLookupIndex() {
    const index = new Map();
    const maps = Array.isArray(window.MASTER_MAP_LIST) ? window.MASTER_MAP_LIST : [];

    for (const mapItem of maps) {
        if (!mapItem) continue;
        const mapId = mapItem.id || mapItem.mapId;
        const idKey = normalizeSlugKey(mapId);
        const nameKey = normalizeSlugKey(mapItem.name);
        if (idKey && !index.has(idKey)) index.set(idKey, mapItem);
        if (nameKey && !index.has(nameKey)) index.set(nameKey, mapItem);
    }

    return index;
}

function resolveRotationPortraitUrl(rawPortrait, heroName) {
    const candidate =
        rawPortrait ||
        (typeof getHeroPortrait === 'function' ? getHeroPortrait({ name: heroName }) : '');

    if (!candidate) return FALLBACK_ROTATION_PORTRAIT;
    if (typeof resolvePortraitUrl === 'function') {
        return resolvePortraitUrl(candidate);
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(candidate) || FALLBACK_ROTATION_PORTRAIT;
    }
    return candidate;
}

function matchHeroWithIndex(apiHero, heroIndex) {
    const keys = [
        normalizeSlugKey(apiHero?.ID),
        normalizeSlugKey(apiHero?.Name)
    ].filter(Boolean);

    let matched = null;
    for (const key of keys) {
        if (heroIndex.has(key)) {
            matched = heroIndex.get(key);
            break;
        }
    }

    const fallbackName = apiHero?.Name || apiHero?.ID || 'Unknown Hero';
    const rawPortrait = matched?.portrait || apiHero?.ImageURL || '';

    return {
        id: matched ? matched.id : (apiHero?.ID || normalizeSlugKey(fallbackName)),
        name: matched?.name || fallbackName,
        role: matched?.role || 'Free Rotation',
        portraitUrl: resolveRotationPortraitUrl(rawPortrait, matched?.name || fallbackName),
        reqLevel: apiHero?.ReqLevel ?? null
    };
}

function matchMapWithIndex(apiMap, mapIndex) {
    const keys = [
        normalizeSlugKey(apiMap?.ID),
        normalizeSlugKey(apiMap?.Name)
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
        id: matchedId || apiMap?.ID || normalizeSlugKey(apiMap?.Name),
        name: matched?.name || apiMap?.Name || apiMap?.ID || 'Battleground',
        inApp: Boolean(matched && matchedId)
    };
}

function parseRotationPayload(raw) {
    const root = raw?.data || raw || {};
    const heroBlock = root.RotationHero || root.rotationHero || {};
    const bgBlock = root.RotationBattleground || root.rotationBattleground || {};

    const heroIndex = buildHeroLookupIndex();
    const mapIndex = buildMapLookupIndex();

    const rawHeroes = Array.isArray(heroBlock.Heroes)
        ? heroBlock.Heroes
        : (Array.isArray(heroBlock.heroes) ? heroBlock.heroes : []);

    const heroes = rawHeroes.map(h => matchHeroWithIndex(h, heroIndex));

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
        source: root._source || 'none'
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
    img.src = hero.portraitUrl;
    img.alt = `${hero.name} portrait`;
    img.className = 'hex-sidebar-img';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
        img.src = FALLBACK_ROTATION_PORTRAIT;
    }, { once: true });

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

    if (spanEl) {
        spanEl.textContent = data.allHeroesFree
            ? `${data.timespan} · All Heroes Free`
            : data.timespan;
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

    // Avoid direct cross-origin requests from GitHub Pages when no proxy is configured
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
            // Fall through to the next candidate source
        }
    }

    currentRotationData = parseRotationPayload(rawPayload || { _source: 'none' });
    renderFreeRotationHeroes(currentRotationData);
    renderBattlegroundRotation(currentRotationData);
}
