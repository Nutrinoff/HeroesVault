// ==========================================
// 1. GLOBAL STATE & CONFIGURATIONS
// ==========================================

let MASTER_HERO_LIST = [];
let MASTER_MAP_LIST = [];
let PERSONAL_BUILDS = [];
let MASTER_TIERS = {};
let HOTS_MASTER_DATA = {};

let currentSelectedHeroId = null;
let currentHeroData = null;
let currentBuildIndex = 0;
let builderHeroId = null;
let builderHeroData = null;
let builderSelectedTalents = [1, 1, 1, 1, 1, 1, 1];


// ==========================================
// 2. INITIALIZATION & ROUTING
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [mr, br, mapr, tr] = await Promise.all([
            fetch('./data/heroes-master.json'),
            fetch('./data/builds.json'),
            fetch('./data/maps.json'),
            fetch('./data/tiers.json')
        ].map(p => p.catch(() => null)));
        
        if (mr?.ok) {
            const d = await mr.json();
            HOTS_MASTER_DATA = d.items || d;
            
            const rawHeroes = Array.isArray(HOTS_MASTER_DATA) 
                ? HOTS_MASTER_DATA 
                : Object.values(HOTS_MASTER_DATA);

            MASTER_HERO_LIST = rawHeroes.map(h => ({
                id: h.id || h.hyperlinkId || h.attributeId,
                name: h.name || 'Unknown Hero',
                title: h.title || 'Nexus Combatant',
                role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
                portrait: getHeroPortrait(h)
            }));

            preloadAllAssets(rawHeroes);
        }

        if (br?.ok) PERSONAL_BUILDS = await br.json();
        if (mapr?.ok) {
            MASTER_MAP_LIST = await mapr.json();
            if (typeof populateMapsDropdown === 'function') {
                populateMapsDropdown();
            }
        }
        if (tr?.ok) MASTER_TIERS = await tr.json();
        
        renderHeroSidebar(MASTER_HERO_LIST);
        renderTierList();
        handleRoute();
        
        if (window.lucide) {
            lucide.createIcons();
        }
        
        window.addEventListener('popstate', handleRoute);
        
        window.onclick = e => {
            if (!e.target.closest('#maps-dropdown-menu') && !e.target.closest('#maps-dropdown-toggle')) {
                document.getElementById('maps-dropdown-menu')?.classList.add('hidden');
            }
        };
    } catch (e) {
        console.error('Failed loading data files:', e);
    }
});

function navigateTo(tab, params = {}, push = true) {
    let url = '#' + tab;
    const q = new URLSearchParams();
    
    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
            q.set(k, v);
        }
    });
    
    if (q.toString()) url += '?' + q.toString();
    
    if (push) {
        history.pushState({ tab, params }, '', url);
    } else {
        history.replaceState({ tab, params }, '', url);
    }
    
    handleRoute();
}

function handleRoute() {
    const [tpart, query = ''] = location.hash.replace(/^#/, '').split('?');
    const tab = tpart || 'heroes';
    const q = new URLSearchParams(query);
    
    switchTabUI(tab);
    
    if (tab === 'heroes') {
        selectHero(q.get('hero') || MASTER_HERO_LIST[0]?.id, false);
    } else if (tab === 'map') {
        if (typeof selectMap === 'function') {
            selectMap(q.get('id') || 'alteracpass', false);
        }
    } else if (tab === 'builder') {
        openBuilder(q.get('hero') || MASTER_HERO_LIST[0]?.id, q.get('build') ? q.get('build').split('').map(Number) : null, false);
    }
}

function switchTabUI(t) {
    const h = t === 'heroes';
    const m = t === 'map';
    const b = t === 'builder';
    const l = t === 'tierlist';
    
    [['view-heroes', h], ['view-map', m], ['view-builder', b], ['view-tierlist', l]].forEach(([id, on]) => {
        document.getElementById(id).classList.toggle('hidden', !on);
    });
    
    document.getElementById('sidebar-container').classList.toggle('hidden', !h && !b);
    
    [['nav-heroes', h], ['nav-builder', b], ['nav-tierlist', l]].forEach(([id, on]) => {
        document.getElementById(id).classList.toggle('nav-active', on);
    });
}


// ==========================================
// 3. SIDEBAR & SEARCH
// ==========================================

function renderHeroSidebar(heroes) {
    const list = document.getElementById('hero-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    const isB = !document.getElementById('view-builder').classList.contains('hidden');
    const active = isB ? builderHeroId : currentSelectedHeroId;
    
    heroes.forEach(h => {
        const tier = getHeroTier(h.id);
        const s = TIER_STYLES[tier] || TIER_STYLES.D;
        const b = document.createElement('button');
        
        b.className = `w-full text-left p-2.5 rounded-xl border transition-all ${
            active === h.id 
                ? 'bg-sky-500/15 border-sky-500/70' 
                : 'border-slate-800 bg-slate-950/40 hover:bg-slate-800/80'
        }`;
        
        b.onclick = () => isB 
            ? openBuilder(h.id, null, true) 
            : navigateTo('heroes', { hero: h.id });
            
        b.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <img src="${getAssetUrl(h.portrait)}" onerror="this.src='https://via.placeholder.com/56?text=H'" class="w-14 h-14 object-contain">
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-bold truncate">${h.name}</h4>
                    <p class="text-xs text-slate-400 truncate">${h.role || 'Nexus Combatant'}</p>
                </div>
                <span class="text-[10px] font-mono font-bold px-2 py-1 rounded-md border ${s.bg} ${s.text} ${s.border}">
                    ${tier} Tier
                </span>
            </div>
        `;
        
        list.appendChild(b);
    });
    
    document.getElementById('hero-count').innerText = `${heroes.length} Heroes`;
}

function filterHeroes() {
    const q = document.getElementById('hero-search').value.toLowerCase();
    renderHeroSidebar(MASTER_HERO_LIST.filter(h => h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q)));
}


// ==========================================
// 4. UNIFIED HEADER RENDERERS
// ==========================================

function renderAbilityStrip(abilitiesList, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    
    const list = (abilitiesList || []).filter(a => {
        const keyUpper = String(a.key || '').toUpperCase();
        const nameLower = String(a.name || '').toLowerCase();
        const catLower = String(a.category || '').toLowerCase();
        
        if (['HEROIC', 'R', 'B'].includes(keyUpper) || catLower === 'hearth' || nameLower === 'hearth') {
            return false;
        }
        
        if (keyUpper === 'Z' || catLower === 'mount' || nameLower.includes('mount')) {
            const isCustomZ = nameLower.includes('tunnel') || nameLower.includes('flight') || nameLower.includes('burrow');
            if (!isCustomZ && (nameLower.includes('summon mount') || nameLower === 'mount' || catLower === 'mount')) {
                return false;
            }
        }
        
        return true;
    });
    
    if (!list.length) {
        box.innerHTML = '<span class="text-xs text-slate-500">No abilities configured</span>';
        return;
    }
    
    list.forEach(a => {
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-xl p-1.5 min-w-12';
        el.onmouseenter = e => showAbilityTooltip(e, a);
        el.onmouseleave = hideTooltip;
        el.innerHTML = `
            <img src="${getAssetUrl(a.icon)}" onerror="this.src='https://via.placeholder.com/32?text=?'" class="w-8 h-8 rounded-lg border border-slate-700 object-cover">
            <span class="text-[10px] font-mono font-bold text-sky-300">${a.key || 'Z'}</span>
            ${a.variant ? `<span class="text-[8px] text-slate-400 max-w-16 truncate" title="${a.variant}">${a.variant}</span>` : ''}
        `;
        box.appendChild(el);
    });
}

function renderHeroHeader(heroData) {
    if (!heroData) return;
    const portraitUrl = getAssetUrl(heroData.portrait);
    
    document.getElementById('hero-portrait').src = portraitUrl;
    document.getElementById('hero-name').innerText = heroData.name;
    document.getElementById('hero-role').innerText = heroData.role;
    document.getElementById('hero-title').innerText = heroData.title;
    
    renderAbilityStrip(heroData.abilities, 'hero-abilities');
}

function renderBuilderHeader(heroData) {
    if (!heroData) return;
    const portraitUrl = getAssetUrl(heroData.portrait);
    
    document.getElementById('builder-portrait').src = portraitUrl;
    document.getElementById('builder-name').innerText = heroData.name;
    document.getElementById('builder-role').innerText = heroData.role;
    document.getElementById('builder-title').innerText = heroData.title;
    
    const bgModel = document.getElementById('builder-model-bg');
    if (bgModel) {
        bgModel.src = portraitUrl;
    }
    
    renderAbilityStrip(heroData.abilities, 'builder-abilities');
}


// ==========================================
// 5. HERO DETAILS & BUILDS VIEW
// ==========================================

async function selectHero(id, update = true) {
    if (!id) return;
    
    currentSelectedHeroId = id;
    currentBuildIndex = 0;
    switchTabUI('heroes');
    
    if (update) {
        navigateTo('heroes', { hero: id });
    }
    
    renderHeroSidebar(MASTER_HERO_LIST);
    
    const h = resolveHeroMasterData(id);
    if (!h) return console.error('Missing hero master entry', id);
    
    currentHeroData = {
        id,
        name: h.name || id,
        title: h.title || 'Nexus Combatant',
        role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
        portrait: getHeroPortrait(h),
        abilities: flattenHeroAbilities(h),
        talents: normalizeTalentTree(h.talents || h.talentTree || {})
    };
    
    renderHeroHeader(currentHeroData);
    renderActiveBuild();
}

function renderActiveBuild() {
    const h = currentHeroData;
    if (!h) return;
    
    const d = PERSONAL_BUILDS.find(x => normalizeHeroKey(x.heroId) === normalizeHeroKey(h.id));
    const tabs = document.getElementById('build-tabs');
    const notes = document.getElementById('detail-notes');
    
    tabs.innerHTML = '';
    
    if (!d?.builds?.length) {
        notes.innerText = 'No notes added for this hero yet.';
        renderBuildStrip(h, null);
        return;
    }
    
    d.builds.forEach((v, i) => {
        const b = document.createElement('button');
        b.className = `px-3.5 py-1.5 rounded-lg text-xs font-bold border ${
            i === currentBuildIndex 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' 
                : 'bg-slate-950 text-slate-400 border-slate-800'
        }`;
        b.innerText = `Build ${i + 1}: ${v.buildName || 'Unnamed'}`;
        b.onclick = () => {
            currentBuildIndex = i;
            renderActiveBuild();
        };
        tabs.appendChild(b);
    });
    
    const v = d.builds[currentBuildIndex] || d.builds[0];
    notes.innerHTML = v.notes || 'No notes added yet.';
    renderBuildStrip(h, v.buildCode);
}

function renderBuildStrip(h, code) {
    const box = document.getElementById('build-strip');
    box.innerHTML = '';
    
    const p = decodeBuildCode(code);
    
    ['1', '4', '7', '10', '13', '16', '20'].forEach((l, i) => {
        const t = h.talents[l]?.[p[i] - 1] || h.talents[l]?.[0];
        const el = document.createElement('div');
        
        el.className = 'bg-slate-950/60 border border-slate-800 rounded-xl p-2 flex flex-col items-center gap-2';
        el.innerHTML = t ? `
            <img src="${getAssetUrl(t.icon)}" onerror="this.src='https://via.placeholder.com/44?text=?'" class="w-11 h-11 rounded-lg border border-slate-700 object-cover">
            <span class="text-[10px] text-sky-300">Lv ${l}</span>
            <span class="text-[10px] text-center text-slate-200">${t.name}</span>
        ` : `
            <span class="text-[10px] text-slate-500">Lv ${l} · none</span>
        `;
        
        box.appendChild(el);
    });
}


// ==========================================
// 6. TOOLTIPS
// ==========================================

function showAbilityTooltip(e, a) {
    showTooltip(e, a.name, `Ability [${a.key}]${a.variant ? ' · ' + a.variant : ''}`, a.desc, a.icon);
}

function showTalentTooltip(e, t, l) {
    showTooltip(e, t.name, `Level ${l} Talent`, t.fullText || t.shortText || t.description || '', t.icon);
}

function showTooltip(e, name, level, description, icon) {
    const tip = document.getElementById('talent-tooltip');
    document.getElementById('tip-icon').src = getAssetUrl(icon);
    document.getElementById('tip-name').innerText = name || '';
    document.getElementById('tip-level').innerText = level;
    document.getElementById('tip-desc').innerHTML = formatGameText(description) || 'No description available.';
    tip.style.left = `${e.clientX + 15}px`;
    tip.style.top = `${e.clientY + 15}px`;
    tip.classList.remove('hidden');
}

function hideTooltip() {
    document.getElementById('talent-tooltip').classList.add('hidden');
}
