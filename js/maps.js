// ==========================================
// MAPS & BATTLEGROUNDS MODULE
// ==========================================

function toggleMapsDropdown(e) {
    e.stopPropagation();
    document.getElementById('maps-dropdown-menu').classList.toggle('hidden');
}

function populateMapsDropdown() {
    const menu = document.getElementById('maps-dropdown-menu');
    menu.innerHTML = '<div class="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Battlegrounds</div>' + 
        MASTER_MAP_LIST.slice().sort((a, b) => a.name.localeCompare(b.name)).map(m => `
            <a href="#map?id=${encodeURIComponent(m.id)}" onclick="selectMapFromDropdown('${String(m.id).replace(/'/g, "\\'")}');return false" class="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                ${m.name}
            </a>
        `).join('');
}

function selectMapFromDropdown(id) {
    document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
    navigateTo('map', { id });
}

async function selectMap(id, update = true) {
    if (update) {
        navigateTo('map', { id });
        return;
    }

    document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
    switchTabUI('map');

    const summary = MASTER_MAP_LIST.find(m => m.id === id) || { id, name: id };
    let details = {};

    try {
        const r = await fetch(`./data/maps/${encodeURIComponent(id)}.json`);
        if (r.ok) {
            details = await r.json();
        } else {
            console.warn(`No map details for ${id}: HTTP ${r.status}`);
        }
    } catch (e) {
        console.warn(`Failed to load map details for ${id}`, e);
    }

    const m = { ...summary, ...details };

    document.getElementById('map-name').innerText = m.name || summary.name || id;
    document.getElementById('map-theme').innerText = m.theme || summary.theme || '';
    document.getElementById('map-portrait').src = getAssetUrl(m.portrait || summary.portrait || '');

    const mech = document.getElementById('map-mechanic');
    if (m.mechanic && typeof m.mechanic === 'object') {
        mech.innerHTML = `<strong class="text-white block mb-1">${m.mechanic.title || 'Objective'}</strong>${m.mechanic.description || ''}`;
    } else {
        mech.innerText = m.mechanic || 'Objective details coming soon.';
    }

    document.getElementById('map-strategy').innerText = m.strategy || 'Strategy guide coming soon.';
    document.getElementById('map-notes').innerText = m.notes || 'No special notes recorded for this map.';

    document.getElementById('map-camps-stack').innerHTML = (m.camps || []).map(c => `
        <div class="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <b class="text-sm">${c.name || 'Camp'}</b>
            <p class="text-xs text-amber-300 mt-1">${c.timing || ''}</p>
            <p class="text-xs text-slate-400 mt-1">${c.notes || c.tip || ''}</p>
        </div>
    `).join('') || '<p class="text-xs text-slate-500">No camp data configured.</p>';

    document.getElementById('map-heroes-list').innerHTML = (m.goldenHeroes || []).map(heroId => {
        const h = MASTER_HERO_LIST.find(x => normalizeHeroKey(x.id) === normalizeHeroKey(heroId));
        return h ? `
            <button onclick="navigateTo('heroes',{hero:'${h.id}'})" class="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-left hover:border-sky-500">
                <img src="${getAssetUrl(h.portrait)}" onerror="this.src='https://via.placeholder.com/40?text=H'" class="w-9 h-9 rounded object-cover">
                <span class="text-xs">${h.name}</span>
            </button>
        ` : '';
    }).join('') || '<span class="text-xs text-slate-500">No golden heroes configured.</span>';
}
