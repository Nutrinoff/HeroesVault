// ==========================================
// TALENT CALCULATOR / BUILDER MODULE
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
