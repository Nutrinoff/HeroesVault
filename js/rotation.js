// ===========================================
// 1. CONFIGURATION & STATE
// ===========================================

var LOCAL_ROTATION_DATA_URL = './data/rotation.json';
var ROTATION_FETCH_TIMEOUT_MS = 4000;
var ROTATION_PORTRAIT_SIZE_PX = 39;

// Explicit canonical mappings for display names / IDs that differ from master keys
var EXPLICIT_ROTATION_OVERRIDES = {
    deckardcain: 'deckard',
    dva: 'dva',
    sgthammer: 'sergeanthammer',
    chogall: 'chogall',
    thelostvikings: 'lostvikings'
};

var FALLBACK_ROTATION_PORTRAIT =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" fill="#160b33"/>' +
        '<polygon points="32,6 56,19 56,45 32,58 8,45 8,19" fill="#251354" stroke="#24c6ff" stroke-width="2"/>' +
        '<text x="32" y="38" text-anchor="middle" fill="#f4b41a" font-family="sans-serif" font-size="16" font-weight="bold">H</text>' +
        '</svg>'
    );

var currentRotationData = null;
var rawRotationCache = null;
var rotationFetchInflight = null;


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

function parseDateBoundary(val, isEndOfDay) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
        return new Date(val.getTime());
    }

    var str = String(val).trim();
    var isoDayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (isoDayMatch) {
        var year = Number(isoDayMatch[1]);
        var month = Number(isoDayMatch[2]) - 1;
        var day = Number(isoDayMatch[3]);
        return isEndOfDay
            ? new Date(year, month, day, 23, 59, 59, 999)
            : new Date(year, month, day, 0, 0, 0, 0);
    }

    var parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return null;
    if (isEndOfDay && str.indexOf('T') === -1 && str.indexOf(':') === -1) {
        parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
}

function pickActiveScheduleEntry(list, now) {
    var refDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    if (!Array.isArray(list) || list.length === 0) return null;
    var nowMs = refDate.getTime();

    for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        if (!entry || typeof entry !== 'object') continue;

        var start = parseDateBoundary(entry.startDate || entry.StartDate, false);
        var end = parseDateBoundary(entry.endDate || entry.EndDate, true);

        var afterStart = !start || nowMs >= start.getTime();
        var beforeEnd = !end || nowMs <= end.getTime();
        if ((start || end) && afterStart && beforeEnd) {
            return entry;
        }
    }

    return null;
}

function collectMasterHeroRecords() {
    var records = [];
    var seen = new Set();

    function addRecord(record, explicitKey) {
        if (!record || typeof record !== 'object') return;

        var rawId =
            record.id ||
            record.hyperlinkId ||
            record.attributeId ||
            stripUnitIdPrefix(record.unitId) ||
            explicitKey ||
            record.name;

        var canonicalId = String(rawId || '').trim();
        var dedupeKey = normalizeSlugKey(canonicalId || record.name);
        if (!dedupeKey || seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        var rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(canonicalId) : null;
        var hasRawFields = Boolean(
            record.abilities || record.talents || record.unitId || record.portraits || record.name
        );

        records.push({
            canonicalId: canonicalId,
            listItem: typeof record.name === 'string' && record.portrait !== undefined ? record : null,
            rawEntry: rawEntry || (hasRawFields ? record : null)
        });
    }

    if (Array.isArray(window.MASTER_HERO_LIST)) {
        for (var i = 0; i < window.MASTER_HERO_LIST.length; i++) {
            addRecord(window.MASTER_HERO_LIST[i], '');
        }
    }

    var masterRoot = window.HOTS_MASTER_DATA;
    var source = (masterRoot && typeof masterRoot === 'object' && masterRoot.items)
        ? masterRoot.items
        : masterRoot;

    if (Array.isArray(source)) {
        for (var j = 0; j < source.length; j++) {
            addRecord(source[j], '');
        }
    } else if (source && typeof source === 'object') {
        var keys = Object.keys(source);
        for (var k = 0; k < keys.length; k++) {
            var key = keys[k];
            addRecord(source[key], key);
        }
    }

    return records;
}

function buildCanonicalHeroIndex() {
    var byKey = new Map();
    var records = collectMasterHeroRecords();

    for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var listHero = rec.listItem || {};
        var rawHero = rec.rawEntry || {};

        var candidates = [
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

        for (var c = 0; c < candidates.length; c++) {
            var norm = normalizeSlugKey(candidates[c]);
            if (norm && !byKey.has(norm)) {
                byKey.set(norm, rec);
            }
        }
    }

    return { byKey: byKey, records: records };
}

function findPrefixMasterMatch(normalizedCandidates, records) {
    var bestMatch = null;
    var bestLen = 0;

    for (var i = 0; i < normalizedCandidates.length; i++) {
        var candidate = normalizedCandidates[i];
        if (!candidate || candidate.length < 3) continue;

        for (var r = 0; r < records.length; r++) {
            var rec = records[r];
            var listHero = rec.listItem || {};
            var rawHero = rec.rawEntry || {};

            var canonicalKeys = [
                normalizeSlugKey(rec.canonicalId),
                normalizeSlugKey(listHero.name),
                normalizeSlugKey(rawHero.name),
                normalizeSlugKey(stripUnitIdPrefix(rawHero.unitId))
            ].filter(Boolean);

            for (var k = 0; k < canonicalKeys.length; k++) {
                var cKey = canonicalKeys[k];
                if (cKey.length >= 3 && candidate.indexOf(cKey) === 0 && cKey.length > bestLen) {
                    bestMatch = rec;
                    bestLen = cKey.length;
                }
            }
        }
    }

    return bestMatch;
}

function resolveRotationPortraitUrl(record, item) {
    var sources = [record && record.listItem, record && record.rawEntry, item].filter(Boolean);

    if (typeof resolveAssetUrl === 'function') {
        for (var i = 0; i < sources.length; i++) {
            var resolved = resolveAssetUrl(sources[i], '');
            if (resolved) return resolved;
        }
        return FALLBACK_ROTATION_PORTRAIT;
    }

    for (var j = 0; j < sources.length; j++) {
        var src = sources[j];
        var p = src.portraits || {};
        var rawPath =
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
    var item = typeof entry === 'string' ? { name: entry, id: entry } : (entry || {});
    var rawName = String(item.Name || item.name || item.heroName || item.Hero || '').trim();
    var rawId = String(
        item.ID || item.id || item.hyperlinkId || item.attributeId || item.unitId || ''
    ).trim();

    var rawCandidates = [
        rawId,
        stripUnitIdPrefix(rawId),
        rawName,
        rawName.split(',')[0],
        rawName.replace(/\./g, ''),
        rawName.replace(/['’]/g, '')
    ].filter(Boolean);

    var normalizedCandidates = [];
    for (var i = 0; i < rawCandidates.length; i++) {
        var norm = normalizeSlugKey(rawCandidates[i]);
        if (!norm) continue;
        if (normalizedCandidates.indexOf(norm) === -1) {
            normalizedCandidates.push(norm);
        }

        var override = EXPLICIT_ROTATION_OVERRIDES[norm];
        var normOverride = normalizeSlugKey(override);
        if (normOverride && normalizedCandidates.indexOf(normOverride) === -1) {
            normalizedCandidates.push(normOverride);
        }
    }

    var matchedRecord = null;
    for (var k = 0; k < normalizedCandidates.length; k++) {
        var key = normalizedCandidates[k];
        if (indexBundle.byKey.has(key)) {
            matchedRecord = indexBundle.byKey.get(key);
            break;
        }
    }

    if (!matchedRecord) {
        matchedRecord = findPrefixMasterMatch(normalizedCandidates, indexBundle.records);
    }

    var fallbackName = rawName || rawId || 'Unknown Hero';
    var fallbackId = rawId || normalizeSlugKey(fallbackName);

    if (!matchedRecord && (rawName || rawId)) {
        console.warn('[Rotation] Unmatched hero in rotation data: "' + fallbackName + '" (id: "' + (rawId || 'none') + '")');
    }

    var listHero = (matchedRecord && matchedRecord.listItem) || {};
    var rawHero = (matchedRecord && matchedRecord.rawEntry) || {};

    var canonicalId = (matchedRecord && matchedRecord.canonicalId) || fallbackId;
    var canonicalName = listHero.name || rawHero.name || fallbackName;
    var canonicalRole =
        listHero.role ||
        (Array.isArray(listHero.roles) && listHero.roles[0]) ||
        listHero.expandedRole ||
        (Array.isArray(rawHero.roles) && rawHero.roles[0]) ||
        rawHero.expandedRole ||
        'Free Rotation';

    var rawReqLevel = item.ReqLevel !== undefined ? item.ReqLevel : item.reqLevel;

    return {
        id: canonicalId,
        name: canonicalName,
        role: canonicalRole,
        portraitUrl: resolveRotationPortraitUrl(matchedRecord, item),
        reqLevel: rawReqLevel !== undefined ? rawReqLevel : null
    };
}


// ==========================================
// 3. SCHEDULE LOADING & PARSING
// ==========================================

function resolveHeroBlockFromJson(root, now) {
    var scheduleList = Array.isArray(root.rotations)
        ? root.rotations
        : (Array.isArray(root.Rotations)
            ? root.Rotations
            : (Array.isArray(root.schedule)
                ? root.schedule
                : (Array.isArray(root.Schedule) ? root.Schedule : null)));

    var activeSlot = pickActiveScheduleEntry(scheduleList, now);
    if (activeSlot) {
        var slotHeroes = Array.isArray(activeSlot.heroes)
            ? activeSlot.heroes
            : (Array.isArray(activeSlot.Heroes) ? activeSlot.Heroes : []);

        var slotTimespan =
            activeSlot.timespan ||
            activeSlot.Timespan ||
            activeSlot.label ||
            [activeSlot.startDate || activeSlot.StartDate, activeSlot.endDate || activeSlot.EndDate]
                .filter(Boolean)
                .join(' – ') ||
            'Current Rotation';

        var slotAllFree = Boolean(
            activeSlot.allHeroesFree !== undefined ? activeSlot.allHeroesFree : activeSlot.AllHeroesFree
        );

        return {
            heroes: slotHeroes,
            timespan: slotTimespan,
            allHeroesFree: slotAllFree
        };
    }

    var fallbackBlock = root.RotationHero || root.rotationHero || root.current || {};
    var fallbackHeroes = Array.isArray(fallbackBlock.Heroes)
        ? fallbackBlock.Heroes
        : (Array.isArray(fallbackBlock.heroes) ? fallbackBlock.heroes : []);

    var fallbackTimespan =
        fallbackBlock.Timespan ||
        fallbackBlock.timespan ||
        [fallbackBlock.StartDate, fallbackBlock.EndDate].filter(Boolean).join(' – ') ||
        'Weekly Rotation';

    var fallbackAllFree = Boolean(
        fallbackBlock.AllHeroesFree !== undefined ? fallbackBlock.AllHeroesFree : fallbackBlock.allHeroesFree
    );

    return {
        heroes: fallbackHeroes,
        timespan: fallbackTimespan,
        allHeroesFree: fallbackAllFree
    };
}

function parseRotationPayload(raw, now) {
    var root = raw && typeof raw === 'object'
        ? (raw.data && typeof raw.data === 'object' ? raw.data : raw)
        : {};
    var indexBundle = buildCanonicalHeroIndex();
    var heroBlock = resolveHeroBlockFromJson(root, now);
    var rawList = heroBlock.heroes || [];
    var heroes = [];

    for (var i = 0; i < rawList.length; i++) {
        heroes.push(matchHeroWithIndex(rawList[i], indexBundle));
    }

    return {
        heroes: heroes,
        timespan: heroBlock.timespan,
        allHeroesFree: heroBlock.allHeroesFree
    };
}

function fetchLocalRotationJson(url, timeoutMs) {
    var targetUrl = url || LOCAL_ROTATION_DATA_URL;
    var limitMs = typeof timeoutMs === 'number' ? timeoutMs : ROTATION_FETCH_TIMEOUT_MS;

    if (rotationFetchInflight) {
        return rotationFetchInflight;
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, limitMs) : null;

    rotationFetchInflight = fetch(targetUrl, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
    })
        .then(function (res) {
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        })
        .finally(function () {
            if (timer) clearTimeout(timer);
            rotationFetchInflight = null;
        });

    return rotationFetchInflight;
}

function sortRotationHeroesF2pFirst(heroes) {
    return heroes.slice().sort(function (a, b) {
        var aIsLvl = String((a && a.reqLevel) || '').trim().toUpperCase() === 'LVL' ? 1 : 0;
        var bIsLvl = String((b && b.reqLevel) || '').trim().toUpperCase() === 'LVL' ? 1 : 0;
        return aIsLvl - bIsLvl;
    });
}


// ==========================================
// 4. FREE ROTATION RENDERING
// ==========================================

function createFreeHeroRow(hero) {
    var isLvlSlot = String(hero.reqLevel || '').trim().toUpperCase() === 'LVL';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isLvlSlot
        ? 'f2p-row-item f2p-row-lvl group'
        : 'f2p-row-item group';
    btn.title = isLvlSlot
        ? hero.name + ' — Unlocked rotation slot (Account Level 5, 10, 15, or 20)'
        : 'View ' + hero.name + ' builds';
    btn.addEventListener('click', function () {
        if (typeof navigateTo === 'function') {
            navigateTo('builds', { hero: hero.id });
        }
    });

    var frame = document.createElement('div');
    frame.className = 'hex-sidebar-frame';
    frame.style.width = ROTATION_PORTRAIT_SIZE_PX + 'px';
    frame.style.height = ROTATION_PORTRAIT_SIZE_PX + 'px';

    var img = document.createElement('img');
    img.src = hero.portraitUrl || FALLBACK_ROTATION_PORTRAIT;
    img.alt = hero.name + ' portrait';
    img.className = 'hex-sidebar-img';
    img.loading = 'eager';
    img.decoding = 'async';
    img.addEventListener(
        'error',
        function () {
            if (img.src !== FALLBACK_ROTATION_PORTRAIT) {
                img.src = FALLBACK_ROTATION_PORTRAIT;
            }
        },
        { once: true }
    );

    var ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ringSvg.setAttribute('class', 'hex-sidebar-ring');
    ringSvg.setAttribute('viewBox', '0 0 100 100');
    ringSvg.setAttribute('aria-hidden', 'true');

    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '50,-1.5 96.5,24.2 96.5,75.8 50,101.5 3.5,75.8 3.5,24.2');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', isLvlSlot ? 'rgba(244, 63, 94, 0.85)' : 'rgba(41, 197, 255, 0.85)');
    poly.setAttribute('stroke-width', '4.5');
    poly.setAttribute('stroke-linejoin', 'round');
    ringSvg.appendChild(poly);

    frame.appendChild(img);
    frame.appendChild(ringSvg);

    var nameEl = document.createElement('span');
    nameEl.className = 'w-full text-[11px] font-semibold text-slate-100 group-hover:text-cyan-300 truncate leading-tight';
    nameEl.textContent = hero.name;

    var badgeEl = document.createElement('span');
    badgeEl.className = isLvlSlot
        ? 'text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-sm bg-rose-500/15 text-rose-400 border border-rose-500/35'
        : 'text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-sm bg-cyan-500/15 text-cyan-300 border border-cyan-400/35';
    badgeEl.textContent = isLvlSlot
        ? 'LVL'
        : (hero.reqLevel ? 'Lv ' + hero.reqLevel + '+' : 'F2P');

    btn.appendChild(frame);
    btn.appendChild(nameEl);
    btn.appendChild(badgeEl);
    return btn;
}

function renderFreeRotationHeroes(data) {
    var grid = document.getElementById('home-f2p-grid');
    var spanEl = document.getElementById('home-f2p-timespan');
    if (!grid) return;

    if (spanEl) {
        spanEl.textContent = data.allHeroesFree
            ? data.timespan + ' · All Heroes Free'
            : data.timespan;
    }

    var sortedHeroes = sortRotationHeroesF2pFirst((data.heroes || []).slice(0, 14));
    if (!sortedHeroes.length) {
        grid.innerHTML =
            '<div class="col-span-2 text-xs text-violet-200/70 py-2">No free rotation heroes available right now.</div>';
        return;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < sortedHeroes.length; i++) {
        frag.appendChild(createFreeHeroRow(sortedHeroes[i]));
    }
    grid.replaceChildren(frag);
}

function loadAndRenderRotation() {
    var payloadPromise = rawRotationCache
        ? Promise.resolve(rawRotationCache)
        : fetchLocalRotationJson(LOCAL_ROTATION_DATA_URL, ROTATION_FETCH_TIMEOUT_MS)
            .then(function (payload) {
                rawRotationCache = payload;
                return payload;
            })
            .catch(function (err) {
                console.warn('Failed to load rotation.json:', err);
                return {};
            });

    return payloadPromise.then(function (rawPayload) {
        currentRotationData = parseRotationPayload(rawPayload, new Date());
        renderFreeRotationHeroes(currentRotationData);
        return currentRotationData;
    });
}
