// ==========================================
// MAPS & BATTLEGROUNDS MODULE
// ==========================================

const MAP_DETAILS_CACHE = new Map();
const MAP_FALLBACK_BANNER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500"><rect width="1200" height="500" fill="#0d0724"/><rect x="1" y="1" width="1198" height="498" fill="none" stroke="#38247a" stroke-width="2"/><text x="600" y="258" fill="#8c83a2" font-family="monospace" font-size="28" text-anchor="middle">BATTLEGROUND ART UNAVAILABLE</text></svg>')}`;
const MAP_HERO_FALLBACK_PORTRAIT = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0d0724"/><rect x="1" y="1" width="62" height="62" fill="none" stroke="#38247a" stroke-width="2"/><text x="32" y="39" fill="#9cb6ff" font-family="monospace" font-size="22" text-anchor="middle">?</text></svg>')}`;

let activeMapSelectionSeq = 0;

function resolveMapAssetUrl(assetSource, fallbackUrl) {
    if (typeof resolveAssetUrl === 'function') {
        return resolveAssetUrl(assetSource, fallbackUrl || '');
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(assetSource, fallbackUrl || '');
    }
    if (!assetSource) return fallbackUrl || '';
    return typeof assetSource === 'string' ? assetSource : (fallbackUrl || '');
}

function preloadMapImage(portraitSource) {
    if (!portraitSource) return;
    if (typeof warmAsset === 'function') {
        warmAsset(portraitSource);
        return;
    }
    const url = resolveMapAssetUrl(portraitSource, '');
    if (!url) return;
    if (typeof preloadAllAssets === 'function') {
        preloadAllAssets([url]);
    }
}

function applyMapImageFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    if (typeof attachImageFallback === 'function') {
        attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = fallbackUrl;
    };
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
                return null;
            }
            try {
                const parsed = await r.json();
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (parseErr) {
                console.warn(`Malformed JSON in map details for ${id}`, parseErr);
                return null;
            }
        })
        .catch(e => {
            console.warn(`Failed to load map details for ${id}`, e);
            return null;
        });

    MAP_DETAILS_CACHE.set(id, request);
    const resolved = await request;

    if (resolved && typeof resolved === 'object') {
        MAP_DETAILS_CACHE.set(id, resolved);
        return resolved;
    }

    if (MAP_DETAILS_CACHE.get(id) === request) {
        MAP_DETAILS_CACHE.delete(id);
    }
    return {};
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
        if (typeof preloadAllAssets === 'function') {
            preloadAllAssets(MASTER_MAP_LIST.map(m => m?.portrait).filter(Boolean), { limit: MASTER_MAP_LIST.length });
        } else {
            MASTER_MAP_LIST.forEach(m => {
                if (m?.portrait) preloadMapImage(m.portrait);
            });
        }
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

function formatSpecFieldValue(value) {
    if (!value) return '';
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean).join(' → ');
    }
    if (typeof value === 'object') {
        const parts = [];
        if (value.timing || value.time || value.first || value.initial) {
            parts.push(value.timing || value.time || value.first || value.initial);
        }
        if (value.location || value.detail || value.rotation || value.cycle || value.rule) {
            parts.push(value.location || value.detail || value.rotation || value.cycle || value.rule);
        }
        if (Array.isArray(value.locations) && value.locations.length) {
            parts.push(value.locations.join(', '));
        }
        return parts.join(' — ');
    }
    return String(value).trim();
}

function renderMapSpecTable(mapData) {
    const tbody = document.getElementById('map-spec-table');
    if (!tbody) return;

    const firstObjText = formatSpecFieldValue(
        mapData.firstObjective || mapData.firstSpawn || mapData.objectiveStart || ''
    );
    const patternText = formatSpecFieldValue(
        mapData.spawnPattern || mapData.objectivePattern || mapData.spawnLocations || mapData.rotationPattern || ''
    );
    const lanesText = formatSpecFieldValue(mapData.lanes || '');
    const bossesText = formatSpecFieldValue(mapData.bosses || '');
    const cadenceText = formatSpecFieldValue(mapData.objectiveDuration || mapData.respawnCooldown || '');

    const rows = [
        { label: 'First Obj.', value: firstObjText, accent: 'text-[#f5d89a]' },
        { label: 'Obj. Pattern', value: patternText, accent: 'text-[#58baff]' },
        { label: 'Lanes', value: lanesText, accent: 'text-[#e6ecff]' },
        { label: 'Bosses', value: bossesText, accent: 'text-[#e6ecff]' },
        { label: 'Cadence', value: cadenceText, accent: 'text-[#9cb6ff]' }
    ].filter(row => Boolean(row.value));

    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.className = 'py-3 text-xs text-[#8c83a2] italic';
        td.textContent = 'No special spawn/layout specs for this battleground.';
        tr.appendChild(td);
        tbody.replaceChildren(tr);
        return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'align-baseline';

        const th = document.createElement('th');
        th.scope = 'row';
        th.className = 'py-2.5 pr-3 w-24 font-mono text-[10px] uppercase tracking-wider text-[#9d90ff] font-semibold whitespace-nowrap';
        th.textContent = row.label;

        const td = document.createElement('td');
        td.className = `py-2.5 pl-1 leading-snug ${row.accent}`;
        td.textContent = row.value;

        tr.append(th, td);
        frag.appendChild(tr);
    });

    tbody.replaceChildren(frag);
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
        row.className = idx === 0 ? 'pb-3 space-y-1' : 'pt-3 pb-1 space-y-1';

        const titleEl = document.createElement('div');
        titleEl.className = 'text-xs font-bold text-[#e6ecff] leading-snug';
        titleEl.textContent = String(c?.name || 'Camp');
        row.appendChild(titleEl);

        if (c?.timing) {
            const timingEl = document.createElement('div');
            timingEl.className = 'text-[11px] font-mono text-[#f5d89a] leading-snug';
            timingEl.textContent = String(c.timing);
            row.appendChild(timingEl);
        }

        const noteText = String(c?.notes || c?.tip || '').trim();
        if (noteText) {
            const notesEl = document.createElement('p');
            notesEl.className = 'text-xs text-[#9cb6ff]/80 leading-relaxed pt-0.5';
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
        btn.title = h.name;
        btn.setAttribute('aria-label', `View ${h.name} builds`);
        btn.className = 'w-11 h-11 md:w-12 md:h-12 rounded-[2px] border border-[#5c42b8]/90 bg-[#070412]/90 overflow-hidden hover:border-[#58baff] hover:shadow-[0_0_12px_rgba(0,156,255,0.45)] transition cursor-pointer shrink-0';
        btn.addEventListener('click', () => {
            if (typeof navigateTo === 'function') {
                navigateTo('builds', { hero: h.id });
            }
        });

        const img = document.createElement('img');
        img.className = 'w-full h-full object-cover block';
        img.alt = h.name;
        img.loading = 'lazy';
        applyMapImageFallback(img, MAP_HERO_FALLBACK_PORTRAIT);
        img.src = resolveMapAssetUrl(h.portrait, MAP_HERO_FALLBACK_PORTRAIT);

        btn.appendChild(img);
        frag.appendChild(btn);
    }

    if (frag.childNodes.length > 0) {
        heroesEl.replaceChildren(frag);
    } else {
        const empty = document.createElement('span');
        empty.className = 'text-[11px] text-[#8c83a2]';
        empty.textContent = 'None listed';
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
        applyMapImageFallback(portraitEl, MAP_FALLBACK_BANNER);
        portraitEl.src = resolveMapAssetUrl(mapData.portrait, MAP_FALLBACK_BANNER);
    }

    renderMapSpecTable(mapData);
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
