// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================

var ROTATION_FETCH_TIMEOUT_MS = 4000;
var ROTATION_PORTRAIT_SIZE_PX = 45;

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


// ==========================================
// 2. DATE & CANONICAL HERO LOOKUP HELPERS
// ==========================================

function getRotationApi() {
    return typeof window !== 'undefined' && window.HeroesVaultApi && typeof window.HeroesVaultApi === 'object'
        ? window.HeroesVaultApi
        : null;
}

function getRotationCatalogApi() {
    return window.HeroesVaultCatalog && typeof window.HeroesVaultCatalog === 'object'
        ? window.HeroesVaultCatalog
        : null;
}

function getRotationDomApi() {
    return window.HeroesVaultDom && typeof window.HeroesVaultDom === 'object'
        ? window.HeroesVaultDom
        : null;
}

function resolveRotationHeroKey(val) {
    var catalog = getRotationCatalogApi();
    if (catalog && typeof catalog.normalizeKey === 'function') {
        return catalog.normalizeKey(val);
    }
    if (typeof normalizeHeroKey === 'function') {
        return normalizeHeroKey(val);
    }
    return String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function stripUnitIdPrefix(unitId) {
    return String(unitId || '').replace(/^hero/i, '');
}

function buildHeroLookupCandidates(rawId, rawName) {
    var baseName = String(rawName || '').split(',')[0].trim();
    var withoutCain = baseName.replace(/\s+cain\b/i, '').trim();

    var list = [
        rawId,
        stripUnitIdPrefix(rawId),
        rawName,
        baseName,
        withoutCain,
        baseName.replace(/\./g, ''),
        baseName.replace(/['’]/g, ''),
        withoutCain.replace(/\./g, ''),
        withoutCain.replace(/['’]/g, '')
    ];

    var seen = new Set();
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var val = String(list[i] || '').trim();
        if (!val) continue;
        var norm = resolveRotationHeroKey(val);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        out.push(val);
    }
    return out;
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

function formatRotationEndDate(val) {
    var end = parseDateBoundary(val, true);
    if (!end) return '';
    return end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

function resolveRotationTimespan(entry) {
    if (!entry || typeof entry !== 'object') return 'Weekly Rotation';

    var rawLabel = String(
        entry.timespan || entry.Timespan || entry.label || ''
    ).trim();
    var endStr = formatRotationEndDate(entry.endDate || entry.EndDate);

    if (rawLabel && endStr) {
        return rawLabel + ' – ' + endStr;
    }
    if (rawLabel) {
        return rawLabel;
    }

    var startStr = formatRotationEndDate(entry.startDate || entry.StartDate);
    if (startStr && endStr) {
        return startStr + ' – ' + endStr;
    }
    return startStr || endStr || 'Weekly Rotation';
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

function findRosterEntryByCandidates(candidates) {
    var catalog = getRotationCatalogApi();
    if (catalog && typeof catalog.getHero === 'function') {
        for (var i = 0; i < candidates.length; i++) {
            var hit = catalog.getHero(candidates[i]);
            if (hit && hit.rawHero) {
                return hit.rawHero;
            }
        }
    }

    var roster = typeof MASTER_HERO_LIST !== 'undefined' && Array.isArray(MASTER_HERO_LIST)
        ? MASTER_HERO_LIST
        : [];
    if (!roster.length) return null;

    var candidateKeys = [];
    for (var kIdx = 0; kIdx < candidates.length; kIdx++) {
        var k = resolveRotationHeroKey(candidates[kIdx]);
        if (k && candidateKeys.indexOf(k) === -1) {
            candidateKeys.push(k);
        }
    }
    if (!candidateKeys.length) return null;

    for (var c = 0; c < candidateKeys.length; c++) {
        var targetKey = candidateKeys[c];
        for (var r = 0; r < roster.length; r++) {
            var hero = roster[r];
            if (!hero || typeof hero !== 'object') continue;
            var idKey = resolveRotationHeroKey(hero.id);
            var nameKey = resolveRotationHeroKey(hero.name);
            var baseNameKey = resolveRotationHeroKey(String(hero.name || '').split(',')[0]);
            if (idKey === targetKey || nameKey === targetKey || baseNameKey === targetKey) {
                return hero;
            }
        }
    }

    return null;
}

function resolveMatchedHeroRecord(candidates) {
    var catalog = getRotationCatalogApi();
    var matchedCatalogHero = null;
    var matchedRaw = null;
    var matchedNormalized = null;

    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        if (!candidate) continue;

        if (!matchedCatalogHero && catalog && typeof catalog.getHero === 'function') {
            matchedCatalogHero = catalog.getHero(candidate);
        }
        if (!matchedRaw && typeof getRawHeroEntry === 'function') {
            matchedRaw = getRawHeroEntry(candidate);
        }
        if (!matchedNormalized && typeof getNormalizedHeroData === 'function') {
            matchedNormalized = getNormalizedHeroData(candidate);
        }
        if ((matchedCatalogHero || (matchedRaw && matchedNormalized))) break;
    }

    if (matchedCatalogHero) {
        matchedNormalized = matchedNormalized || matchedCatalogHero.normHero || null;
    }

    var rosterMatch = (matchedCatalogHero && matchedCatalogHero.rawHero) || findRosterEntryByCandidates(candidates);
    var canonicalId =
        (matchedCatalogHero && matchedCatalogHero.id) ||
        (matchedNormalized && matchedNormalized.id) ||
        (matchedRaw && (matchedRaw.id || matchedRaw.hyperlinkId || matchedRaw.attributeId)) ||
        (rosterMatch && rosterMatch.id) ||
        '';

    if (canonicalId) {
        if (!matchedCatalogHero && catalog && typeof catalog.getHero === 'function') {
            matchedCatalogHero = catalog.getHero(canonicalId);
        }
        if (!matchedRaw && typeof getRawHeroEntry === 'function') {
            matchedRaw = getRawHeroEntry(canonicalId);
        }
        if (!matchedNormalized && typeof getNormalizedHeroData === 'function') {
            matchedNormalized = getNormalizedHeroData(canonicalId);
        }
    }

    if (!matchedCatalogHero && !matchedRaw && !matchedNormalized && !rosterMatch) {
        return null;
    }

    return {
        canonicalId: canonicalId || (rosterMatch && rosterMatch.id) || '',
        catalogHero: matchedCatalogHero || null,
        listItem: rosterMatch || null,
        rawEntry: matchedRaw || null,
        normalized: matchedNormalized || null
    };
}

function resolveRotationPortraitUrl(record, item) {
    if (record && record.catalogHero && record.catalogHero.portrait) {
        return record.catalogHero.portrait;
    }

    var catalog = getRotationCatalogApi();
    if (catalog && typeof catalog.getAssetMeta === 'function' && record && record.canonicalId) {
        var meta = catalog.getAssetMeta(record.canonicalId);
        if (meta && meta.url) return meta.url;
    }

    var sources = [
        record && record.normalized,
        record && record.listItem,
        record && record.rawEntry,
        item
    ].filter(Boolean);

    if (typeof resolveAssetUrl === 'function') {
        for (var i = 0; i < sources.length; i++) {
            var resolved = resolveAssetUrl(sources[i], '');
            if (resolved) return resolved;
        }
    }
    return FALLBACK_ROTATION_PORTRAIT;
}

function matchHeroWithIndex(entry) {
    var item = typeof entry === 'string' ? { name: entry, id: entry } : (entry || {});
    var rawName = String(item.Name || item.name || item.heroName || item.Hero || '').trim();
    var rawId = String(
        item.ID || item.id || item.hyperlinkId || item.attributeId || item.unitId || ''
    ).trim();

    var candidates = buildHeroLookupCandidates(rawId, rawName);

    var matchedRecord = resolveMatchedHeroRecord(candidates);
    var fallbackName = rawName || rawId || 'Unknown Hero';
    var fallbackId = rawId || resolveRotationHeroKey(fallbackName);

    if (!matchedRecord && (rawName || rawId)) {
        console.warn('[Rotation] Unmatched hero in rotation data: "' + fallbackName + '" (id: "' + (rawId || 'none') + '")');
    }

    var catHero = (matchedRecord && matchedRecord.catalogHero) || {};
    var normHero = (matchedRecord && matchedRecord.normalized) || {};
    var listHero = (matchedRecord && matchedRecord.listItem) || {};
    var rawHero = (matchedRecord && matchedRecord.rawEntry) || {};

    var isMatched = Boolean(matchedRecord && matchedRecord.canonicalId);
    var canonicalId = isMatched ? matchedRecord.canonicalId : '';
    var canonicalName = catHero.name || normHero.name || listHero.name || rawHero.name || fallbackName;
    var canonicalRole =
        catHero.role ||
        normHero.role ||
        listHero.role ||
        (Array.isArray(listHero.roles) && listHero.roles[0]) ||
        listHero.expandedRole ||
        (Array.isArray(rawHero.roles) && rawHero.roles[0]) ||
        rawHero.expandedRole ||
        'Free Rotation';

    var rawReqLevel = item.ReqLevel !== undefined ? item.ReqLevel : item.reqLevel;

    return {
        id: canonicalId,
        rawId: fallbackId,
        matched: isMatched,
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

        var slotTimespan = resolveRotationTimespan(activeSlot);

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

    var fallbackTimespan = resolveRotationTimespan(fallbackBlock);

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
    var heroBlock = resolveHeroBlockFromJson(root, now);
    var rawList = heroBlock.heroes || [];
    var heroes = [];

    for (var i = 0; i < rawList.length; i++) {
        heroes.push(matchHeroWithIndex(rawList[i]));
    }

    return {
        heroes: heroes,
        timespan: heroBlock.timespan,
        allHeroesFree: heroBlock.allHeroesFree
    };
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

function applyRotationPortraitFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    var dom = getRotationDomApi();
    if (dom && typeof dom.attachImageFallback === 'function') {
        dom.attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    if (typeof attachImageFallback === 'function') {
        attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    imgEl.addEventListener(
        'error',
        function onFallbackError() {
            imgEl.removeEventListener('error', onFallbackError);
            if (imgEl.getAttribute('src') !== fallbackUrl) {
                imgEl.src = fallbackUrl;
            }
        }
    );
}

function createFreeHeroRow(hero) {
    var isLvlSlot = String(hero.reqLevel || '').trim().toUpperCase() === 'LVL';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isLvlSlot
        ? 'f2p-row-item f2p-row-lvl group'
        : 'f2p-row-item group';
    btn.title = !hero.matched
        ? hero.name + ' (roster match unavailable)'
        : (isLvlSlot
            ? hero.name + ' — Unlocked rotation slot (Account Level 5, 10, 15, or 20)'
            : 'View ' + hero.name + ' builds');
    btn.addEventListener('click', function () {
        if (typeof navigateTo === 'function') {
            if (hero.matched && hero.id) {
                navigateTo('builds', { hero: hero.id });
            } else {
                navigateTo('builds');
            }
        }
    });

    var frame = document.createElement('div');
    frame.className = 'hex-sidebar-frame';
    frame.style.width = ROTATION_PORTRAIT_SIZE_PX + 'px';
    frame.style.height = ROTATION_PORTRAIT_SIZE_PX + 'px';

    var img = document.createElement('img');
    img.alt = hero.name + ' portrait';
    img.className = 'hex-sidebar-img';
    img.loading = 'eager';
    img.decoding = 'async';
    applyRotationPortraitFallback(img, FALLBACK_ROTATION_PORTRAIT);
    img.src = hero.portraitUrl || FALLBACK_ROTATION_PORTRAIT;

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

function loadAndRenderRotation(options = {}) {
    var api = getRotationApi();
    var requestPromise = typeof api?.fetchRotationData === 'function'
        ? api.fetchRotationData({
            force: Boolean(options.force),
            timeoutMs: typeof options.timeoutMs === 'number' ? options.timeoutMs : ROTATION_FETCH_TIMEOUT_MS,
        })
        : Promise.resolve({});

    return requestPromise
        .catch(function (err) {
            console.warn('Failed to load rotation.json:', err);
            return {};
        })
        .then(function (rawPayload) {
            currentRotationData = parseRotationPayload(rawPayload, new Date());
            renderFreeRotationHeroes(currentRotationData);
            return currentRotationData;
        });
}
