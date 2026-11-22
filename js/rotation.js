// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================

const LOCAL_ROTATION_DATA_URL = './data/rotation.json';
const ROTATION_FETCH_TIMEOUT_MS = 4000;
const ROTATION_PORTRAIT_SIZE_PX = 39;

// Only use for genuine name/ID mismatches that cannot be matched via master fields or prefix tokens.
const EXPLICIT_ROTATION_OVERRIDES = {
    deckardcain: 'deckard'
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
let rawRotationCache = null;


// ==========================================
// 2. DATE & CANONICAL HERO LOOKUP HELPERS
// ==========================================

function normalizeSlugKey(val) {
    return String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/[^a-z0-9]/g, '');
}

function stripUnitIdPrefix(unitId) {
    return String(unitId || '').replace(/^hero/i, '');
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

function collectMasterHeroRecords() {
    const records = [];
    const seen = new Set();

    const addRecord = (record, explicitKey = '') => {
        if (!record || typeof record !== 'object') return;
        const rawId =
            record.id ||
            record.hyperlinkId ||
            record.attributeId ||
            stripUnitIdPrefix(record.unitId) ||
            explicitKey ||
            record.name;
        const canonicalId = String(rawId || '').trim();
        const dedupeKey = normalizeSlugKey(canonicalId || record.name);
        if (!dedupeKey || seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(canonicalId) : null;
        records.push({
            canonicalId,
            listItem: typeof record.name === 'string' && record.portrait !== undefined ? record : null,
            rawEntry: rawEntry || (rawEntry === null && (record.abilities || record.talents || record.unitId || record.portraits) ? record : null)
        });
    };

    if (Array.isArray(window.MASTER_HERO_LIST)) {
        for (const h of window.MASTER_HERO_LIST) addRecord(h);
    }

    const source = window.HOTS_MASTER_DATA;
    if (Array.isArray(source)) {
        for (const h of source) addRecord(h);
    } else if (source && typeof source === 'object') {
        for (const [key, h] of Object.entries(source)) addRecord(h, key);
    }

    return records;
}

function buildCanonicalHeroIndex() {
    const byKey = new Map();
    const records = collectMasterHeroRecords();

    for (const rec of records) {
        const listHero = rec.listItem || {};
        const rawHero = rec.rawEntry || {};
        const keys = [
            rec.canonicalId,
            listHero.id,
            listHero.name,
            String(listHero.name || '').split(',')[0],
            rawHero.id,
            rawHero.hyperlinkId,
            rawHero.attributeId,
            stripUnitIdPrefix(rawHero.unitId),
            rawHero.name,
            String(rawHero.name || '').split(',')[0]
        ];

        for (const candidate of keys) {
            const norm = normalizeSlugKey(candidate);
            if (norm && !byKey.has(norm)) {
                byKey.set(norm, rec);
            }
        }
    }

    return { byKey, records };
}

function findPrefixMasterMatch(normalizedCandidates, records) {
    let bestMatch = null;
    let bestLen = 0;

    for (const candidate of normalizedCandidates) {
        if (!candidate || candidate.length < 3) continue;

        for (const rec of records) {
            const listHero = rec.listItem || {};
            const rawHero = rec.rawEntry || {};
            const canonicalKeys = [
                normalizeSlugKey(rec.canonicalId),
                normalizeSlugKey(listHero.name),
                normalizeSlugKey(rawHero.name),
                normalizeSlugKey(stripUnitIdPrefix(rawHero.unitId))
            ].filter(Boolean);

            for (const cKey of canonicalKeys) {
                if (cKey.length >= 3 && candidate.startsWith(cKey) && cKey.length > bestLen) {
                    bestMatch = rec;
                    bestLen = cKey.length;
                }
            }
        }
    }

    return bestMatch;
}

function resolveRotationPortraitUrl(record, item) {
    const sources = [record?.listItem, record?.rawEntry, item].filter(Boolean);
    if (typeof resolveAssetUrl === 'function') {
        for (const src of sources) {
            const resolved = resolveAssetUrl(src, '');
            if (resolved) return resolved;
        }
        return FALLBACK_ROTATION_PORTRAIT;
    }

    for (const src of sources) {
        const p = src.portraits || {};
        const rawPath =
            p.draftScreen ||
            p.heroSelect ||
            p.leaderboard ||
            p.target ||
            src.portrait ||
            src.portraitUrl ||
            src.imageUrl ||
            src.ImageURL ||
            src.icon ||
            '';
        if (rawPath) return String(rawPath).trim();
    }

    return FALLBACK_ROTATION_PORTRAIT;
}

function matchHeroWithIndex(entry, indexBundle) {
    const item = typeof entry === 'string' ? { name: entry, id: entry } : (entry || {});
    const rawName = item.Name || item.name || '';
    const rawId = item.ID || item.id || '';

    const rawCandidates = [rawId, rawName, String(rawName).split(',')[0]].filter(Boolean);
    const normalizedCandidates = [];

    for (const c of rawCandidates) {
        const norm = normalizeSlugKey(c);
        if (!norm) continue;
        if (!normalizedCandidates.includes(norm)) normalizedCandidates.push(norm);
        const override = EXPLICIT_ROTATION_OVERRIDES[norm];
        const normOverride = normalizeSlugKey(override);
        if (normOverride && !normalizedCandidates.includes(normOverride)) {
            normalizedCandidates.push(normOverride);
        }
    }

    let matchedRecord = null;
    for (const key of normalizedCandidates) {
        if (indexBundle.byKey.has(key)) {
            matchedRecord = indexBundle.byKey.get(key);
            break;
        }
    }

    if (!matchedRecord) {
        matchedRecord = findPrefixMasterMatch(normalizedCandidates, indexBundle.records);
    }

    const fallbackName = rawName || rawId || 'Unknown Hero';
    const fallbackId = rawId || normalizeSlugKey(fallbackName);

    if (!matchedRecord) {
        console.warn('[Rotation] Unmatched hero in rotation data:', { id: rawId, name: rawName });
    }

    const listHero = matchedRecord?.listItem || {};
    const rawHero = matchedRecord?.rawEntry || {};
    const canonicalId = matchedRecord?.canonicalId || fallbackId;
    const canonicalName = listHero.name || rawHero.name || fallbackName;
    const canonicalRole =
        listHero.role ||
        (Array.isArray(listHero.roles) && listHero.roles[0]) ||
        listHero.expandedRole ||
        (Array.isArray(rawHero.roles) && rawHero.roles[0]) ||
        rawHero.expandedRole ||
        'Free Rotation';

    return {
        id: canonicalId,
        name: canonicalName,
        role: canonicalRole,
        portraitUrl: resolveRotationPortraitUrl(matchedRecord, item),
        reqLevel: item.ReqLevel ?? item.reqLevel ?? null
    };
}


// ==========================================
// 3. SCHEDULE LOADING & PARSING
// ==========================================

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
    const indexBundle = buildCanonicalHeroIndex();
    const heroBlock = resolveHeroBlockFromJson(root, now);
    const heroes = (heroBlock.heroes || []).map(h => matchHeroWithIndex(h, indexBundle));

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


// ==========================================
// 4. FREE ROTATION RENDERING
// ==========================================

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
    frame.className = 'hex-sidebar-frame';
    frame.style.width = `${ROTATION_PORTRAIT_SIZE_PX}px`;
    frame.style.height = `${ROTATION_PORTRAIT_SIZE_PX}px`;

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

function renderFreeRotationHeroes(data) {
    const grid = document.getElementById('home-f2p-grid');
    const spanEl = document.getElementById('home-f2p-timespan');
    if (!grid) return;

    if (spanEl) {
        spanEl.textContent = data.allHeroesFree
            ? `${data.timespan} · All Heroes Free`
            : data.timespan;
    }

    const sortedHeroes = sortRotationHeroesF2pFirst((data.heroes || []).slice(0, 14));
    if (!sortedHeroes.length) {
        grid.innerHTML =
            '<div class="col-span-2 text-xs text-violet-200/70 py-2">No free rotation heroes available right now.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    for (const hero of sortedHeroes) {
        frag.appendChild(createFreeHeroRow(hero));
    }
    grid.replaceChildren(frag);
}

async function loadAndRenderRotation() {
    let rawPayload = rawRotationCache;

    if (!rawPayload) {
        try {
            rawPayload = await fetchLocalRotationJson(LOCAL_ROTATION_DATA_URL);
            rawRotationCache = rawPayload;
        } catch (err) {
            console.warn('Failed to load rotation.json:', err);
            rawPayload = {};
        }
    }

    currentRotationData = parseRotationPayload(rawPayload, new Date());
    renderFreeRotationHeroes(currentRotationData);
}
