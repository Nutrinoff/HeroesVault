// ==========================================
// MAPS & BATTLEGROUNDS MODULE
// ==========================================

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
    header.className = 'px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap';
    header.textContent = 'Battlegrounds';
    frag.appendChild(header);

    sortedMaps.forEach(m => {
        const link = document.createElement('a');
        link.href = `#map?id=${encodeURIComponent(m.id)}`;
        link.className = 'block px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 whitespace-nowrap';
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

function renderMapMechanic(mechEl, mechanic) {
    if (!mechEl) return;

    if (mechanic && typeof mechanic === 'object') {
        const wrapper = document.createElement('div');
        const titleEl = document.createElement('strong');
        titleEl.className = 'text-white block mb-1';
        titleEl.textContent = String(mechanic.title || 'Objective');

        const descEl = document.createElement('span');
        descEl.textContent = String(mechanic.description || '');

        wrapper.append(titleEl, descEl);
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
        empty.className = 'text-xs text-slate-500';
        empty.textContent = 'No camp data configured.';
        campsEl.replaceChildren(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    for (const c of list) {
        const card = document.createElement('div');
        card.className = 'p-3 bg-slate-950/60 border border-slate-800 rounded-xl';

        const titleEl = document.createElement('b');
        titleEl.className = 'text-sm';
        titleEl.textContent = String(c?.name || 'Camp');

        const timingEl = document.createElement('p');
        timingEl.className = 'text-xs text-amber-300 mt-1';
        timingEl.textContent = String(c?.timing || '');

        const notesEl = document.createElement('p');
        notesEl.className = 'text-xs text-slate-400 mt-1';
        notesEl.textContent = String(c?.notes || c?.tip || '');

        card.append(titleEl, timingEl, notesEl);
        frag.appendChild(card);
    }

    campsEl.replaceChildren(frag);
}

function renderGoldenHeroes(heroesEl, goldenHeroes) {
    if (!heroesEl) return;

    const frag = document.createDocumentFragment();
    const golden = Array.isArray(goldenHeroes) ? goldenHeroes : [];
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
        btn.className = 'flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-left hover:border-sky-500';
        btn.addEventListener('click', () => {
            if (typeof navigateTo === 'function') {
                navigateTo('heroes', { hero: h.id });
            }
        });

        const img = document.createElement('img');
        img.className = 'w-9 h-9 rounded object-cover';
        img.alt = `${h.name} portrait`;
        img.loading = 'lazy';
        img.onerror = () => {
            img.onerror = null;
            img.src = MAP_HERO_FALLBACK_PORTRAIT;
        };
        img.src = resolveMapAssetUrl(h.portrait, MAP_HERO_FALLBACK_PORTRAIT);

        const label = document.createElement('span');
        label.className = 'text-xs';
        label.textContent = h.name;

        btn.append(img, label);
        frag.appendChild(btn);
    }

    if (frag.childNodes.length > 0) {
        heroesEl.replaceChildren(frag);
    } else {
        const empty = document.createElement('span');
        empty.className = 'text-xs text-slate-500';
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
        portraitEl.alt = `${mapData.name || fallbackId} battleground banner`;
        portraitEl.onerror = () => {
            portraitEl.onerror = null;
            portraitEl.src = MAP_FALLBACK_BANNER;
        };
        portraitEl.src = resolveMapAssetUrl(mapData.portrait, MAP_FALLBACK_BANNER);
    }

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
