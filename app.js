/**
 * HEROESVAULT - Main Application Logic
 * Zero-backend, client-side HotS Specs & Strategy Hub
 */

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

const REPO_BASE = 'https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/';

const TIER_STYLES = {
    S: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
    A: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
    B: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
    C: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
    D: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40' }
};


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
        }

        if (br?.ok) PERSONAL_BUILDS = await br.json();
        if (mapr?.ok) {
            MASTER_MAP_LIST = await mapr.json();
            populateMapsDropdown();
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
        selectMap(q.get('id') || 'alteracpass', false);
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
// 3. UTILITIES & DATA NORMALIZATION
// ==========================================

function normalizeHeroKey(v) {
    return String(v || '').toLowerCase().replace(/['’\.\s\-]/g, '').replace(/[^a-z0-9]/g, '');
}

function tierLetter(v) {
    const m = String(v || '').match(/[sabcd]/i);
    return m ? m[0].toUpperCase() : 'D';
}

function getHeroTier(id) {
    id = normalizeHeroKey(id);
    for (const [k, ids] of Object.entries(MASTER_TIERS || {})) {
        if (Array.isArray(ids) && ids.some(v => normalizeHeroKey(typeof v === 'string' ? v : v.id) === id)) {
            return tierLetter(k);
        }
    }
    return 'D';
}

function normalizeTalentTree(tree) {
    const o = {};
    if (tree && typeof tree === 'object') {
        for (const [k, v] of Object.entries(tree)) {
            const n = String(k).replace(/^Level/i, '').replace(/^\D+/, '');
            if (n) {
                o[n] = Array.isArray(v) ? v : [];
            }
        }
    }
    return o;
}

function abilityEntry(a, category, variant = '') {
    return {
        key: a.abilityType || a.buttonId || category,
        name: a.name || a.buttonId || category,
        icon: a.icon || '',
        desc: a.fullText || a.shortText || a.description || '',
        category,
        variant
    };
}

function flattenHeroAbilities(h) {
    if (!h) return [];
    const out = [];
    
    // Deep recursive walker to extract abilities from complex nested trees, forms, and units
    const walk = (node, variant = '') => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(item => {
                if (item && typeof item === 'object') {
                    if (item.name || item.buttonId || item.abilityType || item.icon) {
                        const type = String(item.abilityType || '').toUpperCase();
                        if (!['B', 'R', 'HEROIC'].includes(type)) {
                            out.push(abilityEntry(item, item.category || 'Basic', variant));
                        }
                    } else {
                        walk(item, variant);
                    }
                }
            });
            return;
        }
        if (typeof node === 'object') {
            if (node.name && (node.icon || node.description || node.fullText || node.abilityType)) {
                const type = String(node.abilityType || '').toUpperCase();
                if (!['B', 'R', 'HEROIC'].includes(type)) {
                    out.push(abilityEntry(node, node.category || 'Basic', variant));
                }
            }
            for (const [k, val] of Object.entries(node)) {
                const nextVariant = ['forms', 'heroUnits', 'subAbilities', 'WorldBreaker', 'Destroyer'].includes(k) ? k : variant;
                walk(val, nextVariant);
            }
        }
    };

    walk(h.abilities);
    walk(h.subAbilities);
    walk(h.forms);
    walk(h.heroUnits);
    
    // Deduplicate abilities based on key + name + icon + variant
    const seen = new Set();
    return out.filter(a => {
        const sig = `${a.key}|${a.name}|${a.icon}|${a.variant}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });
}

function resolveHeroMasterData(id) {
    if (!id) return null;
    if (HOTS_MASTER_DATA[id]) return HOTS_MASTER_DATA[id];
    
    if (Array.isArray(HOTS_MASTER_DATA)) {
        return HOTS_MASTER_DATA.find(h => normalizeHeroKey(h.id || h.hyperlinkId) === normalizeHeroKey(id)) || null;
    }
    
    const key = normalizeHeroKey(id);
    for (const [k, h] of Object.entries(HOTS_MASTER_DATA)) {
        if (h && [k, h.name, h.hyperlinkId, h.unitId, h.attributeId].some(v => normalizeHeroKey(v) === key)) {
            return h;
        }
    }
    return null;
}

function getAssetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    
    let p = String(path).replace(/^\.\//, '').replace(/^\//, '');
    if (p.includes('/') && ['abilitytalents/', 'heroportraits/', 'loadingscreens/'].some(x => p.startsWith(x))) {
        return REPO_BASE + p;
    }
    
    if (p.includes('talent') || p.startsWith('storm_ui_icon') || p.includes('ability')) {
        p = 'abilitytalents/' + p;
    } else if (p.includes('hero') || p.includes('portrait') || p.startsWith('ui_') || p.startsWith('storm_ui_ingame')) {
        p = 'heroportraits/' + p;
    }
    
    return REPO_BASE + p;
}

function getHeroPortrait(hero) {
    if (!hero) return '';
    const p = hero.portraits || {};
    return p.draftScreen 
        || p.heroSelect 
        || p.leaderboard 
        || p.target 
        || hero.portrait 
        || '';
}

function formatGameText(value) {
    const source = String(value || '').replace(/<img\b[^>]*\/?>/gi, '');
    if (!source) return '';
    
    const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const tokenRe = /<\/?(?:c|s)\b[^>]*>|<n\s*\/\s*>|<br\s*\/?>/gi;
    
    let output = '';
    let cursor = 0;
    const stack = [];
    let match;
    
    while ((match = tokenRe.exec(source))) {
        let text = escapeHtml(source.slice(cursor, match.index));
        text = text.replace(/~~([^~]+)~~/g, '<del class="text-slate-500">$1</del>');
        output += text;
        cursor = tokenRe.lastIndex;
        const token = match[0];
        
        if (/^<n\s*\/\s*>|<br/i.test(token)) {
            output += '<br>';
            continue;
        }
        if (/^<\//.test(token)) {
            const kind = token.slice(2, 3).toLowerCase();
            for (let i = stack.length - 1; i >= 0; i--) {
                const entry = stack.pop();
                output += '</span>';
                if (entry === kind) break;
            }
            continue;
        }
        
        const kind = token.slice(1, 2).toLowerCase();
        const valMatch = token.match(/\bval\s*=\s*["']([^"']*)["']/i);
        const val = valMatch ? valMatch[1] : '';
        let cls = '';
        
        if (kind === 'c') {
            if (val === '#TooltipNumbers') cls = 'text-amber-300 font-semibold';
            else if (val === '#ColorGray') cls = 'text-slate-500';
            else if (/^#[0-9a-f]{6}$/i.test(val)) cls = '';
            else if (val === '#TooltipQuest') cls = 'text-amber-300 font-semibold';
            else cls = 'text-sky-200';
        } else {
            cls = /Header/i.test(val) ? 'text-white font-semibold' : 'text-slate-400';
        }
        
        if (/^#[0-9a-f]{6}$/i.test(val)) {
            output += `<span style="color:${val}">`;
        } else {
            output += `<span${cls ? ` class="${cls}"` : ''}>`;
        }
        stack.push(kind);
    }
    
    let tail = escapeHtml(source.slice(cursor)).replace(/~~([^~]+)~~/g, '<del class="text-slate-500">$1</del>');
    output += tail;
    
    while (stack.length) {
        stack.pop();
        output += '</span>';
    }
    
    return output;
}


// ==========================================
// 4. SIDEBAR & SEARCH
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
// 5. UNIFIED HEADER RENDERERS
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
// 6. HERO DETAILS & BUILDS VIEW
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
// 7. TALENT BUILDER VIEW
// ==========================================

async function openBuilder(id = null, selections = null, update = true) {
    id = id || MASTER_HERO_LIST[0]?.id;
    if (!id) return;
    
    builderHeroId = id;
    switchTabUI('builder');
    renderHeroSidebar(MASTER_HERO_LIST);
    
    builderSelectedTalents = selections?.length === 7 
        ? selections.map(x => Number(x) || 1) 
        : [1, 1, 1, 1, 1, 1, 1];
        
    const h = resolveHeroMasterData(id);
    if (!h) return console.error('Missing hero master entry', id);
    
    builderHeroData = {
        id,
        name: h.name || id,
        title: h.title || 'Nexus Combatant',
        role: (h.roles && h.roles[0]) || h.expandedRole || 'Nexus Combatant',
        portrait: getHeroPortrait(h),
        abilities: flattenHeroAbilities(h),
        talents: normalizeTalentTree(h.talents || h.talentTree || {})
    };
    
    renderBuilderHeader(builderHeroData);
    renderBuilderMatrix();
    updateBuilderOutput(false);
    
    if (update) {
        navigateTo('builder', { hero: id, build: builderSelectedTalents.join('') });
    }
}

function renderBuilderMatrix() {
    const box = document.getElementById('builder-matrix');
    box.innerHTML = '';
    
    if (!builderHeroData) return;
    
    ['1', '4', '7', '10', '13', '16', '20'].forEach((l, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3';
        row.innerHTML = `<div class="w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-b from-purple-600 to-indigo-900 border-2 border-purple-400/80 font-black">${l}</div>`;
        
        const choices = document.createElement('div');
        choices.className = 'flex flex-wrap gap-2.5 items-center';
        
        (builderHeroData.talents[l] || []).forEach((t, i) => {
            const n = i + 1;
            const b = document.createElement('button');
            
            b.className = `w-12 h-12 rounded-xl border-2 overflow-hidden bg-slate-950 ${
                builderSelectedTalents[idx] === n 
                    ? 'border-amber-400 shadow-lg scale-105' 
                    : 'border-slate-700 hover:border-slate-400 opacity-75 hover:opacity-100'
            }`;
            
            b.onclick = () => {
                builderSelectedTalents[idx] = n;
                renderBuilderMatrix();
                updateBuilderOutput(true);
            };
            
            b.onmouseenter = e => showTalentTooltip(e, t, l);
            b.onmouseleave = hideTooltip;
            b.innerHTML = `<img src="${getAssetUrl(t.icon)}" onerror="this.src='https://via.placeholder.com/48?text=?'" class="w-full h-full object-cover">`;
            
            choices.appendChild(b);
        });
        
        row.appendChild(choices);
        box.appendChild(row);
    });
}

function resetBuilder() {
    builderSelectedTalents = [1, 1, 1, 1, 1, 1, 1];
    renderBuilderMatrix();
    updateBuilderOutput(true);
}

function updateBuilderOutput(update = true) {
    document.getElementById('builder-string-code').innerText = `[T${builderSelectedTalents.join('')},${builderHeroId}]`;
    if (update) {
        navigateTo('builder', { hero: builderHeroId, build: builderSelectedTalents.join('') });
    }
}

function copyBuilderString() {
    const u = location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(u).then(() => alert(`Copied build link:\n${u}`));
    } else {
        prompt('Copy build link:', u);
    }
}

function decodeBuildCode(s) {
    const m = s && s.match(/\[T(\d{7}),/);
    return m ? m[1].split('').map(Number) : [1, 1, 1, 1, 1, 1, 1];
}


// ==========================================
// 8. TOOLTIPS
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


// ==========================================
// 9. TIER LIST VIEW
// ==========================================

function renderTierList() {
    const box = document.getElementById('tierlist-rows-container');
    if (!box) return;
    
    box.innerHTML = '';
    const groups = { S: [], A: [], B: [], C: [], D: [] };

    Object.entries(MASTER_TIERS || {}).forEach(([k, ids]) => {
        (ids || []).forEach(id => {
            const h = MASTER_HERO_LIST.find(x => normalizeHeroKey(x.id) === normalizeHeroKey(typeof id === 'string' ? id : id.id));
            const t = tierLetter(k);
            if (h && !groups[t].some(x => x.id === h.id)) {
                groups[t].push(h);
            }
        });
    });

    Object.entries(groups).forEach(([t, heroes]) => {
        const s = TIER_STYLES[t];
        const r = document.createElement('section');
        
        r.className = 'flex items-stretch overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70';
        r.innerHTML = `
            <div class="w-24 shrink-0 flex items-center justify-center border-r ${s.border} ${s.bg} ${s.text} text-2xl font-black">
                ${t}
            </div>
            <div class="p-3 flex flex-wrap items-center gap-2 min-h-20">
                ${heroes.map(h => `
                    <button onclick="navigateTo('heroes',{hero:'${h.id}'})" class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 hover:border-sky-400">
                        <img src="${getAssetUrl(h.portrait)}" class="w-7 h-7 rounded object-cover">
                        <span>${h.name}</span>
                    </button>
                `).join('') || '<span class="text-xs text-slate-500 italic">No heroes in this tier.</span>'}
            </div>
        `;
        
        box.appendChild(r);
    });
}


// ==========================================
// 10. MAPS & BATTLEGROUNDS VIEW
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
    document.getElementById('map-portrait').src = m.portrait || summary.portrait || '';

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
