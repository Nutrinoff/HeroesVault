// ==========================================
// TIER LIST MODULE
// ==========================================

const TIER_STYLES = {
    S: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
    A: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
    B: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
    C: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
    D: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40' }
};

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
        
        const heroesHtml = heroes.length > 0 
            ? heroes.map(h => `
                <button onclick="navigateTo('heroes', {hero: '${h.id}'})" class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 hover:border-sky-400">
                    <img src="${getAssetUrl(h.portrait)}" class="w-7 h-7 rounded object-cover">
                    <span>${h.name}</span>
                </button>
            `).join('') 
            : '<span class="text-xs text-slate-500 italic">No heroes in this tier.</span>';

        r.innerHTML = `
            <div class="w-24 shrink-0 flex items-center justify-center border-r ${s.border} ${s.bg} ${s.text} text-2xl font-black">
                ${t}
            </div>
            <div class="p-3 flex flex-wrap items-center gap-2 min-h-20">
                ${heroesHtml}
            </div>
        `;
        
        box.appendChild(r);
    });
}
