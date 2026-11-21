// ==========================================
// NEXUS ROTATION MODULE (F2P HEROES & MAPS)
// ==========================================

const NEXUS_ROTATION_API_URL = 'https://nexuscompendium.com/api/currently/herorotation+bgrotation';
const LOCAL_ROTATION_FALLBACK_URL = './data/rotation.json';

let currentRotationData = null;

function escapeRotationHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function normalizeSlugKey(val) {
    return String(val || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function findMatchedHero(apiHero) {
    const roster = Array.isArray(window.MASTER_HERO_LIST) ? window.MASTER_HERO_LIST : [];
    const targetKeys = [
        normalizeSlugKey(apiHero?.ID),
        normalizeSlugKey(apiHero?.Name)
    ].filter(Boolean);

    const matched = roster.find(h => {
        const idKey = normalizeSlugKey(h.id);
        const nameKey = normalizeSlugKey(h.name);
        return targetKeys.includes(idKey) || targetKeys.includes(nameKey);
    });

    if (matched) {
        return {
            id: matched.id,
            name: matched.name || apiHero.Name || 'Unknown Hero',
            role: matched.role || 'Nexus Combatant',
            portrait: matched.portrait,
            reqLevel: apiHero?.ReqLevel ?? null
        };
    }

    const fallbackName = apiHero?.Name || apiHero?.ID || 'Unknown Hero';
    const rawPortrait = apiHero?.ImageURL || (typeof getHeroPortrait === 'function' ? getHeroPortrait({ name: fallbackName }) : '');
    return {
        id: apiHero?.ID || normalizeSlugKey(fallbackName),
        name: fallbackName,
        role: 'Free Rotation',
        portrait: rawPortrait,
        reqLevel: apiHero?.ReqLevel ?? null
    };
}

function findMatchedMap(apiMap) {
    const maps = Array.isArray(window.MASTER_MAP_LIST) ? window.MASTER_MAP_LIST : [];
    const targetKeys = [
        normalizeSlugKey(apiMap?.ID),
        normalizeSlugKey(apiMap?.Name)
    ].filter(Boolean);

    const matched = maps.find(m => {
        const mapIdKey = normalizeSlugKey(m.id || m.mapId);
        const mapNameKey = normalizeSlugKey(m.name);
        return targetKeys.includes(mapIdKey) || targetKeys.includes(mapNameKey);
    });

    return {
        id: matched ? (matched.id || matched.mapId) : (apiMap?.ID || normalizeSlugKey(apiMap?.Name)),
        name: matched?.name || apiMap?.Name || apiMap?.ID || 'Battleground',
        inApp: Boolean(matched)
    };
}

function parseRotationPayload(raw) {
    const root = raw?.data || raw || {};
    const heroBlock = root.RotationHero || root.rotationHero || {};
    const bgBlock = root.RotationBattleground || root.rotationBattleground || {};

    const rawHeroes = Array.isArray(heroBlock.Heroes)
        ? heroBlock.Heroes
        : (Array.isArray(heroBlock.heroes) ? heroBlock.heroes : []);

    const heroes = rawHeroes.map(findMatchedHero);

    const timespan =
        heroBlock.Timespan ||
        heroBlock.timespan ||
        ([heroBlock.StartDate, heroBlock.EndDate].filter(Boolean).join(' – ')) ||
        'Weekly Rotation';

    const allHeroesFree = Boolean(heroBlock.AllHeroesFree ?? heroBlock.allHeroesFree);

    const extractModeList = modeKey => {
        const bucket = bgBlock?.[modeKey] || bgBlock?.[modeKey.toLowerCase()];
        const list = Array.isArray(bucket?.Battlegrounds)
            ? bucket.Battlegrounds
            : (Array.isArray(bucket?.battlegrounds) ? bucket.battlegrounds : []);
        return list.map(findMatchedMap);
    };

    const modes = {
        Ranked: extractModeList('Ranked'),
        Unranked: extractModeList('Unranked'),
        ARAM: extractModeList('ARAM')
    };

    // Fallback if a payload provides a flat battlegrounds array instead of mode buckets
    const flatFallback = Array.isArray(bgBlock.Battlegrounds)
        ? bgBlock.Battlegrounds.map(findMatchedMap)
        : (Array.isArray(bgBlock.battlegrounds) ? bgBlock.battlegrounds.map(findMatchedMap) : []);

    return {
        heroes,
        timespan,
        allHeroesFree,
        modes,
        flatFallback,
        source: root._source || 'live'
    };
}

async function fetchRotationSource(url, timeoutMs = 4500) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        if (timer) clearTimeout(timer);
    }
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

    const displayHeroes = data.heroes.slice(0, 10);
    if (!displayHeroes.length) {
        grid.innerHTML = `<div class="col-span-full text-xs text-violet-200/70 py-3">No free rotation heroes available right now.</div>`;
        return;
    }

    grid.innerHTML = displayHeroes.map(hero => {
        const portraitSrc = typeof getAssetUrl === 'function' ? getAssetUrl(hero.portrait) : hero.portrait;
        const levelBadge = hero.reqLevel ? `Lv ${escapeRotationHtml(hero.reqLevel)}+` : 'F2P';
        return `
            <button
                type="button"
                onclick="navigateTo('builds', { hero: '${escapeRotationHtml(hero.id)}' })"
                class="hots-subpanel hover:border-cyan-400/70 p-2.5 rounded flex flex-col items-center text-center gap-2 transition cursor-pointer group"
                title="View ${escapeRotationHtml(hero.name)} builds"
            >
                <div class="hex-sidebar-frame">
                    <img
                        src="${escapeRotationHtml(portraitSrc)}"
                        onerror="this.src='https://via.placeholder.com/56?text=H'"
                        alt="${escapeRotationHtml(hero.name)}"
                        class="hex-sidebar-img"
                        loading="lazy"
                    />
                    <svg class="hex-sidebar-ring" viewBox="0 0 100 100" aria-hidden="true">
                        <polygon
                            points="50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2"
                            fill="none"
                            stroke="rgba(41, 197, 255, 0.85)"
                            stroke-width="4.5"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
                <div class="w-full min-w-0">
                    <div class="text-xs font-bold text-white group-hover:text-cyan-300 truncate">${escapeRotationHtml(hero.name)}</div>
                    <div class="text-[10px] font-mono text-amber-300/90 mt-0.5">${levelBadge}</div>
                </div>
            </button>
        `;
    }).join('');
}

function renderBattlegroundRotation(data) {
    const container = document.getElementById('home-bg-rotation');
    if (!container) return;

    const modeEntries = Object.entries(data.modes || {}).filter(([, list]) => Array.isArray(list) && list.length > 0);

    const renderMapChip = m => {
        const clickAttr = m.inApp
            ? `onclick="navigateTo('map', { id: '${escapeRotationHtml(m.id)}' })"`
            : `onclick="navigateTo('map')"`;
        return `
            <button
                type="button"
                ${clickAttr}
                class="px-2.5 py-1 rounded-sm text-xs font-semibold bg-[#180c38] hover:bg-[#241254] text-violet-100 hover:text-cyan-200 border border-[#3a207d] hover:border-cyan-400/60 transition cursor-pointer"
            >${escapeRotationHtml(m.name)}</button>
        `;
    };

    if (modeEntries.length > 0) {
        container.innerHTML = modeEntries.map(([modeName, maps]) => `
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold uppercase tracking-wider text-amber-300">${escapeRotationHtml(modeName)}</span>
                    <span class="font-mono text-violet-300/70">${maps.length} Maps</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    ${maps.map(renderMapChip).join('')}
                </div>
            </div>
        `).join('');
        return;
    }

    if (Array.isArray(data.flatFallback) && data.flatFallback.length > 0) {
        container.innerHTML = `<div class="flex flex-wrap gap-1.5">${data.flatFallback.map(renderMapChip).join('')}</div>`;
        return;
    }

    container.innerHTML = `<div class="text-xs text-violet-200/70 py-2">Battleground rotation unavailable right now.</div>`;
}

async function loadAndRenderRotation() {
    let rawPayload = null;

    try {
        rawPayload = await fetchRotationSource(NEXUS_ROTATION_API_URL);
        if (rawPayload && typeof rawPayload === 'object') {
            rawPayload._source = 'live';
        }
    } catch (_) {
        try {
            rawPayload = await fetchRotationSource(LOCAL_ROTATION_FALLBACK_URL);
            if (rawPayload && typeof rawPayload === 'object') {
                rawPayload._source = 'fallback';
            }
        } catch (__) {
            rawPayload = { _source: 'none' };
        }
    }

    currentRotationData = parseRotationPayload(rawPayload);
    renderFreeRotationHeroes(currentRotationData);
    renderBattlegroundRotation(currentRotationData);
}
