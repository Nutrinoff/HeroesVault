// ===========================================
// MAPS & BATTLEGROUNDS MODULE
// ===========================================

const MAP_DETAILS_CACHE = new Map();
const PRELOADED_MAP_IMAGES = new Set();
const MAP_FALLBACK_BANNER = 'https://via.placeholder.com/1200x500?text=Map';
const MAP_HERO_FALLBACK_PORTRAIT = 'https://via.placeholder.com/40?text=H';

let activeMapSelectionSeq = 0;

function resolveMapAssetUrl(assetSource, fallbackUrl) {
    if (!assetSource) return fallbackUrl;
    if (typeof resolveAssetUrl === 'function') {
        return resolveAssetUrl(assetSource, fallbackUrl);
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(assetSource) || fallbackUrl;
    }
    return typeof assetSource === 'string' ? assetSource : fallbackUrl;
}

function preloadMapImage(portraitSource) {
    if (!portraitSource) return;
    const url = resolveMapAssetUrl(portraitSource, '');
    if (!url || PRELOADED_MAP_IMAGES.has(url)) return;

    PRELOADED_MAP_IMAGES.add(url);
    if (typeof preloadAllAssets === 'function') {
        preloadAllAssets([url]);
        return;
    }
    const img = new Image();
    img.src = url;
}

async function fetchMapDetails(id) {
    if (!id) return {};
    if (MAP_DETAILS_CACHE.has(id)) {
        const cached = MAP_DETAILS_CACHE.get(id);
        return typeof cached?.then === 'function' ? await cached : cached;
    }

    const request = fetch(`./data/maps/${encodeURIComponent(id)}.json`)
        .then(async r => {
            if (!r.ok) {
                console.warn(`No map details for ${id}: HTTP ${r.status}`);
                return {};
            }
            try {
                const parsed = await r.json();
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (parseErr) {
                console.warn(`Malformed JSON in map details for ${id}`, parseErr);
                return {};
            }
        })
        .catch(e => {
            console.warn(`Failed to load map details for ${id}`, e);
            return {};
        });

    MAP_DETAILS_CACHE.set(id, request);
    const resolved = await request;
    MAP_DETAILS_CACHE.set(id, resolved);
    return resolved;
}

function warmMapAssets(id) {
    const summary = Array.isArray(MASTER_MAP_LIST)
        ? MASTER_MAP_LIST.find(m => m.id === id)
        : null;
    if (summary?.portrait) {
        preloadMapImage(summary.portrait);
    }
    fetchMapDetails(id).then(details => {
        if (details?.portrait) {
            preloadMapImage(details.portrait);
        }
    });
}

function syncMapsDropdownAria(isExpanded) {
    const toggleBtn = document.getElementById('maps-dropdown-toggle');
    const menu = document.getElementById('maps-dropdown-menu');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(Boolean(isExpanded)));
        if (menu && menu.id && !toggleBtn.getAttribute('aria-controls')) {
            toggleBtn.setAttribute('aria-controls', menu.id);
        }
    }
}

function closeMapsDropdown() {
    document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
    syncMapsDropdownAria(false);
}

function toggleMapsDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('maps-dropdown-menu');
    if (!menu) return;

    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    syncMapsDropdownAria(opening);

    if (opening && Array.isArray(MASTER_MAP_LIST)) {
        MASTER_MAP_LIST.forEach(m => {
            if (m?.portrait) preloadMapImage(m.portrait);
        });
    }
}

function bindMapsEvents() {
    const toggleBtn = document.getElementById('maps-dropdown-toggle');
    if (toggleBtn && toggleBtn.dataset.mapsBound !== 'true') {
        toggleBtn.dataset.mapsBound = 'true';
        syncMapsDropdownAria(false);
        toggleBtn.addEventListener('click', toggleMapsDropdown);
    }
}

function populateMapsDropdown() {
    bindMapsEvents();

    const menu = document.getElementById('maps-dropdown-menu');
    if (!menu) return;

    const mapList = Array.isArray(MASTER_MAP_LIST) ? MASTER_MAP_LIST : [];
    const sortedMaps = mapList.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const frag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'hots-label px-3 py-1 text-[#8c83a2] whitespace-nowrap';
    header.textContent = 'Battlegrounds';
    frag.appendChild(header);

    sortedMaps.forEach(m => {
        const link = document.createElement('a');
        link.href = `#map?id=${encodeURIComponent(m.id)}`;
        link.className = 'block px-4 py-1.5 text-sm text-[#e6ecff]/85 hover:bg-[#190e40] hover:text-[#cbe8ff] transition whitespace-nowrap';
        link.textContent = m.name || m.id;

        link.addEventListener('mouseenter', () => warmMapAssets(m.id), { passive: true });
        link.addEventListener('click', e => {
            e.preventDefault();
            selectMapFromDropdown(m.id);
        });

        frag.appendChild(link);
    });

    menu.replaceChildren(frag);
    syncMapsDropdownAria(!menu.classList.contains('hidden'));
}

function selectMapFromDropdown(id) {
    closeMapsDropdown();
    if (typeof navigateTo === 'function') {
        navigateTo('map', { id });
    }
}

function formatSpawnPatternValue(pattern) {
    if (!pattern) return '';
    if (Array.isArray(pattern)) {
        return pattern.map(item => String(item || '').trim()).filter(Boolean).join(' → ');
    }
    if (typeof pattern === 'object') {
        const parts = [];
        if (pattern.first || pattern.initial) parts.push(`1st: ${pattern.first || pattern.initial}`);
        if (pattern.rotation || pattern.cycle || pattern.rule) parts.push(pattern.rotation || pattern.cycle || pattern.rule);
        if (Array.isArray(pattern.locations) && pattern.locations.length) {
            parts.push(`Locations: ${pattern.locations.join(', ')}`);
        }
        return parts.join(' · ');
    }
    return String(pattern).trim();
}

function renderMapCadence(mapData) {
    const rowEl = document.getElementById('map-objective-cadence-row');
    const firstBlock = document.getElementById('map-first-objective-block');
    const firstEl = document.getElementById('map-first-objective');
    const patternBlock = document.getElementById('map-spawn-pattern-block');
    const patternEl = document.getElementById('map-spawn-pattern');
    const layoutMetaEl = document.getElementById('map-layout-meta');

    if (!rowEl || !firstBlock || !firstEl || !patternBlock || !patternEl) return;

    const firstObjRaw = mapData.firstObjective || mapData.firstSpawn || mapData.objectiveStart || '';
    const firstText = typeof firstObjRaw === 'object'
        ? [firstObjRaw.timing || firstObjRaw.time, firstObjRaw.location || firstObjRaw.detail].filter(Boolean).join(' — ')
        : String(firstObjRaw || '').trim();

    const patternText = formatSpawnPatternValue(
        mapData.spawnPattern || mapData.objectivePattern || mapData.spawnLocations || mapData.rotationPattern || ''
    );

    if (firstText) {
        firstEl.textContent = firstText;
        firstBlock.classList.remove('hidden');
    } else {
        firstEl.textContent = '';
        firstBlock.classList.add('hidden');
    }

    if (patternText) {
        patternEl.textContent = patternText;
        patternBlock.classList.remove('hidden');
    } else {
        patternEl.textContent = '';
        patternBlock.classList.add('hidden');
    }

    if (firstText || patternText) {
        rowEl.classList.remove('hidden');
    } else {
        rowEl.classList.add('hidden');
    }

    if (layoutMetaEl) {
        const metaItems = [];
        if (mapData.lanes) metaItems.push({ label: 'Lanes', value: String(mapData.lanes) });
        if (mapData.bosses) {
            const bossVal = Array.isArray(mapData.bosses) ? mapData.bosses.join(', ') : String(mapData.bosses);
            metaItems.push({ label: 'Bosses', value: bossVal });
        }
        if (mapData.objectiveDuration) metaItems.push({ label: 'Cadence', value: String(mapData.objectiveDuration) });

        if (metaItems.length) {
            const frag = document.createDocumentFragment();
            metaItems.forEach(item => {
                const wrap = document.createElement('div');
                wrap.className = 'flex items-center gap-1.5';

                const k = document.createElement('span');
                k.className = 'font-mono text-[10px] uppercase tracking-wider text-[#8c83a2]';
                k.textContent = `${item.label}:`;

                const v = document.createElement('span');
                v.className = 'text-[#e6ecff]/90';
                v.textContent = item.value;

                wrap.append(k, v);
                frag.appendChild(wrap);
            });
            layoutMetaEl.replaceChildren(frag);
            layoutMetaEl.classList.remove('hidden');
        } else {
            layoutMetaEl.replaceChildren();
            layoutMetaEl.classList.add('hidden');
        }
    }
}

function renderMapMechanic(mechEl, mechanic) {
    if (!mechEl) return;

    if (mechanic && typeof mechanic === 'object') {
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-1';

        if (mechanic.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'font-semibold text-[#cbe8ff]';
            titleEl.textContent = String(mechanic.title);
            wrapper.appendChild(titleEl);
        }

        const descEl = document.createElement('p');
        descEl.className = 'text-[#e6ecff]/90';
        descEl.textContent = String(mechanic.description || '');
        wrapper.appendChild(descEl);

        mechEl.replaceChildren(wrapper);
        return;
    }

    mechEl.textContent = mechanic ? String(mechanic) : 'Objective details coming soon.';
}

function renderMapCamps(campsEl, camps) {
    if (!campsEl) return;

    const list = Array.isArray(camps) ? camps : [];
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-[#8c83a2]';
        empty.textContent = 'No camp data configured.';
        campsEl.replaceChildren(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    list.forEach((c, idx) => {
        const row = document.createElement('div');
        row.className = idx === 0 ? 'pb-2.5 space-y-1' : 'py-2.5 space-y-1';

        const topLine = document.createElement('div');
        topLine.className = 'flex items-baseline justify-between gap-2';

        const titleEl = document.createElement('span');
        titleEl.className = 'text-xs font-bold text-[#e6ecff]';
        titleEl.textContent = String(c?.name || 'Camp');

        topLine.appendChild(titleEl);

        if (c?.timing) {
            const timingEl = document.createElement('span');
            timingEl.className = 'text-[11px] font-mono text-[#f5d89a] shrink-0';
            timingEl.textContent = String(c.timing);
            topLine.appendChild(timingEl);
        }

        row.appendChild(topLine);

        const noteText = String(c?.notes || c?.tip || '').trim();
        if (noteText) {
            const notesEl = document.createElement('p');
            notesEl.className = 'text-xs text-[#9cb6ff]/75 leading-snug';
            notesEl.textContent = noteText;
            row.appendChild(notesEl);
        }

        frag.appendChild(row);
    });

    campsEl.replaceChildren(frag);
}

function renderGoldenHeroes(heroesEl, goldenHeroes) {
    if (!heroesEl) return;

    const frag = document.createDocumentFragment();
    const golden = Array.isArray(goldenHeroes) ? goldenHeroes.slice(0, 5) : [];
    const roster = Array.isArray(MASTER_HERO_LIST) ? MASTER_HERO_LIST : [];
    const keyNormalizer = typeof normalizeHeroKey === 'function'
        ? normalizeHeroKey
        : val => String(val || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const heroId of golden) {
        if (!heroId || typeof heroId !== 'string') continue;
        const h = roster.find(x => keyNormalizer(x.id) === keyNormalizer(heroId));
        if (!h) continue;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inline-flex items-center gap-1.5 rounded-[2px] border border-[#38247a]/90 bg-[#0c0621]/80 px-2 py-1 text-[11px] text-[#e6ecff] hover:border-[#58baff]/75 hover:text-[#cbe8ff] transition cursor-pointer';
        btn.addEventListener('click', () => {
            if (typeof navigateTo === 'function') {
                navigateTo('builds', { hero: h.id });
            }
        });

        const img = document.createElement('img');
        img.className = 'w-5 h-5 rounded-[2px] border border-[#5c42b8]/65 object-cover shrink-0';
        img.alt = `${h.name} portrait`;
        img.loading = 'lazy';
        img.onerror = () => {
            img.onerror = null;
            img.src = MAP_HERO_FALLBACK_PORTRAIT;
        };
        img.src = resolveMapAssetUrl(h.portrait, MAP_HERO_FALLBACK_PORTRAIT);

        const label = document.createElement('span');
        label.className = 'truncate max-w-[7.5rem]';
        label.textContent = h.name;

        btn.append(img, label);
        frag.appendChild(btn);
    }

    if (frag.childNodes.length > 0) {
        heroesEl.replaceChildren(frag);
    } else {
        const empty = document.createElement('span');
        empty.className = 'text-xs text-[#8c83a2]';
        empty.textContent = 'No golden heroes configured.';
        heroesEl.replaceChildren(empty);
    }
}

function renderMapView(m, fallbackId) {
    const mapData = m && typeof m === 'object' ? m : {};
    const nameEl = document.getElementById('map-name');
    const themeEl = document.getElementById('map-theme');
    const portraitEl = document.getElementById('map-portrait');
    const mechEl = document.getElementById('map-mechanic');
    const strategyEl = document.getElementById('map-strategy');
    const notesEl = document.getElementById('map-notes');
    const campsEl = document.getElementById('map-camps-stack');
    const heroesEl = document.getElementById('map-heroes-list');

    if (nameEl) nameEl.textContent = mapData.name || fallbackId;
    if (themeEl) themeEl.textContent = mapData.theme || '';
    if (portraitEl) {
        portraitEl.alt = `${mapData.name || fallbackId} battleground backdrop`;
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = MAP_FALLBACK_BANNER;
        };
        portraitEl.src = resolveMapAssetUrl(mapData.portrait, MAP_FALLBACK_BANNER);
    }

    renderMapCadence(mapData);
    renderMapMechanic(mechEl, mapData.mechanic);

    if (strategyEl) strategyEl.textContent = mapData.strategy || 'Strategy guide coming soon.';
    if (notesEl) notesEl.textContent = mapData.notes || 'No special notes recorded for this map.';

    renderMapCamps(campsEl, mapData.camps);
    renderGoldenHeroes(heroesEl, mapData.goldenHeroes);
}

async function selectMap(id, update = true) {
    if (!id) return;

    if (update) {
        if (typeof navigateTo === 'function') {
            navigateTo('map', { id });
        }
        return;
    }

    const seq = ++activeMapSelectionSeq;
    closeMapsDropdown();
    if (typeof switchTabUI === 'function') {
        switchTabUI('map');
    }

    const mapList = Array.isArray(MASTER_MAP_LIST) ? MASTER_MAP_LIST : [];
    const summary = mapList.find(m => m.id === id) || { id, name: id };

    renderMapView(summary, id);

    const details = await fetchMapDetails(id);
    if (seq !== activeMapSelectionSeq) return;

    const merged = { ...summary, ...details };
    if (merged.portrait) {
        preloadMapImage(merged.portrait);
    }

    renderMapView(merged, id);
}
