// ==========================================
// MAPS & BATTLEGROUNDS MODULE
// ==========================================

const MAP_DETAILS_CACHE = new Map();
const PRELOADED_MAP_IMAGES = new Set();

function preloadMapImage(portraitPath) {
    if (!portraitPath) return;
    const url = getAssetUrl(portraitPath);
    if (!url || PRELOADED_MAP_IMAGES.has(url)) return;

    PRELOADED_MAP_IMAGES.add(url);
    const img = new Image();
    img.src = url;
}

async function fetchMapDetails(id) {
    if (!id) return {};
    if (MAP_DETAILS_CACHE.has(id)) {
        return MAP_DETAILS_CACHE.get(id);
    }

    const request = fetch(`./data/maps/${encodeURIComponent(id)}.json`)
        .then(async r => {
            if (!r.ok) {
                console.warn(`No map details for ${id}: HTTP ${r.status}`);
                return {};
            }
            return r.json();
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
    const summary = MASTER_MAP_LIST.find(m => m.id === id);
    if (summary?.portrait) {
        preloadMapImage(summary.portrait);
    }
    fetchMapDetails(id).then(details => {
        if (details?.portrait) {
            preloadMapImage(details.portrait);
        }
    });
}

function toggleMapsDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('maps-dropdown-menu');
    if (!menu) return;

    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');

    // Warm all summary portraits when opening the dropdown
    if (opening && Array.isArray(MASTER_MAP_LIST)) {
        MASTER_MAP_LIST.forEach(m => {
            if (m?.portrait) preloadMapImage(m.portrait);
        });
    }
}

function populateMapsDropdown() {
    const menu = document.getElementById('maps-dropdown-menu');
    if (!menu) return;

    const sortedMaps = MASTER_MAP_LIST.slice().sort((a, b) => a.name.localeCompare(b.name));
    const frag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500';
    header.textContent = 'Battlegrounds';
    frag.appendChild(header);

    sortedMaps.forEach(m => {
        const link = document.createElement('a');
        link.href = `#map?id=${encodeURIComponent(m.id)}`;
        link.className = 'block px-4 py-2 text-sm text-slate-300 hover:bg-slate-800';
        link.textContent = m.name;

        link.addEventListener('mouseenter', () => warmMapAssets(m.id), { passive: true });
        link.addEventListener('click', e => {
            e.preventDefault();
            selectMapFromDropdown(m.id);
        });

        frag.appendChild(link);
    });

    menu.replaceChildren(frag);
}

function selectMapFromDropdown(id) {
    document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
    navigateTo('map', { id });
}

function renderMapView(m, fallbackId) {
    const nameEl = document.getElementById('map-name');
    const themeEl = document.getElementById('map-theme');
    const portraitEl = document.getElementById('map-portrait');
    const mechEl = document.getElementById('map-mechanic');
    const strategyEl = document.getElementById('map-strategy');
    const notesEl = document.getElementById('map-notes');
    const campsEl = document.getElementById('map-camps-stack');
    const heroesEl = document.getElementById('map-heroes-list');

    if (nameEl) nameEl.innerText = m.name || fallbackId;
    if (themeEl) themeEl.innerText = m.theme || '';
    if (portraitEl && m.portrait) {
        portraitEl.src = getAssetUrl(m.portrait);
    }

    if (mechEl) {
        if (m.mechanic && typeof m.mechanic === 'object') {
            mechEl.innerHTML = `<strong class="text-white block mb-1">${m.mechanic.title || 'Objective'}</strong>${m.mechanic.description || ''}`;
        } else {
            mechEl.innerText = m.mechanic || 'Objective details coming soon.';
        }
    }

    if (strategyEl) strategyEl.innerText = m.strategy || 'Strategy guide coming soon.';
    if (notesEl) notesEl.innerText = m.notes || 'No special notes recorded for this map.';

    if (campsEl) {
        campsEl.innerHTML = (m.camps || []).map(c => `
            <div class="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <b class="text-sm">${c.name || 'Camp'}</b>
                <p class="text-xs text-amber-300 mt-1">${c.timing || ''}</p>
                <p class="text-xs text-slate-400 mt-1">${c.notes || c.tip || ''}</p>
            </div>
        `).join('') || '<p class="text-xs text-slate-500">No camp data configured.</p>';
    }

    if (heroesEl) {
        const frag = document.createDocumentFragment();
        const golden = m.goldenHeroes || [];

        golden.forEach(heroId => {
            const h = MASTER_HERO_LIST.find(x => normalizeHeroKey(x.id) === normalizeHeroKey(heroId));
            if (!h) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-left hover:border-sky-500';
            btn.addEventListener('click', () => navigateTo('heroes', { hero: h.id }));
            btn.innerHTML = `
                <img src="${getAssetUrl(h.portrait)}" onerror="this.src='https://via.placeholder.com/40?text=H'" class="w-9 h-9 rounded object-cover">
                <span class="text-xs">${h.name}</span>
            `;
            frag.appendChild(btn);
        });

        if (frag.childNodes.length > 0) {
            heroesEl.replaceChildren(frag);
        } else {
            heroesEl.innerHTML = '<span class="text-xs text-slate-500">No golden heroes configured.</span>';
        }
    }
}

async function selectMap(id, update = true) {
    if (update) {
        navigateTo('map', { id });
        return;
    }

    document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
    switchTabUI('map');

    const summary = MASTER_MAP_LIST.find(m => m.id === id) || { id, name: id };

    // Paint summary data & start image download immediately before JSON finishes
    renderMapView(summary, id);

    const details = await fetchMapDetails(id);
    const merged = { ...summary, ...details };

    if (merged.portrait) {
        preloadMapImage(merged.portrait);
    }

    renderMapView(merged, id);
}
