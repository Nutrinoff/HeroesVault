// ==========================================
// PATCH NOTES MODULE (FILTERABLE & CHRONOLOGICAL)
// ==========================================

let CURRENT_FILTER = 'all'; // 'all', 'live', or 'ptr'
let ACTIVE_PATCH_ITEMS = [];

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    // Render 3-way filter control header
    renderPatchHeaderControls();

    listContainer.innerHTML = `
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">
            ${CURRENT_FILTER.toUpperCase()} Updates
        </h3>
        <div class="text-xs text-sky-400 p-3 animate-pulse">Loading updates...</div>
    `;

    try {
        // Fetch both files in parallel so we can merge/sort them for 'All'
        const [liveRes, ptrRes] = await Promise.all([
            fetch('./data/live-patches.json').catch(() => ({ ok: false })),
            fetch('./data/ptr-patches.json').catch(() => ({ ok: false }))
        ]);

        let liveItems = [];
        let ptrItems = [];

        if (liveRes.ok) {
            const data = await liveRes.json();
            liveItems = (Array.isArray(data) ? data : []).map(item => ({ ...item, feedType: 'live' }));
        }

        if (ptrRes.ok) {
            const data = await ptrRes.json();
            ptrItems = (Array.isArray(data) ? data : []).map(item => ({ ...item, feedType: 'ptr' }));
        }

        // Combine or isolate based on filter selection
        if (CURRENT_FILTER === 'live') {
            ACTIVE_PATCH_ITEMS = liveItems;
        } else if (CURRENT_FILTER === 'ptr') {
            ACTIVE_PATCH_ITEMS = ptrItems;
        } else {
            // 'all': Merge and sort chronologically newest to oldest by date
            ACTIVE_PATCH_ITEMS = [...liveItems, [...ptrItems]].flat().sort((a, b) => {
                const dateA = new Date(a.date || 0);
                const dateB = new Date(b.date || 0);
                return dateB - dateA; // Descending order (newest first)
            });
        }

        if (ACTIVE_PATCH_ITEMS.length === 0) {
            listContainer.innerHTML = `
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Updates</h3>
                <div class="text-xs text-slate-400 p-3 italic">No updates found in this category.</div>
            `;
            const mainContent = document.getElementById('patch-main-content');
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-6 text-slate-400 text-sm">No patch notes available right now.</div>`;
            }
            return;
        }

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.warn('Failed to load patch data:', err);
        
        ACTIVE_PATCH_ITEMS = [
            {
                id: 'fallback-item',
                title: 'Heroes of the Storm Update Feed',
                date: 'Recent',
                feedType: 'live',
                link: 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                description: '<p class="text-slate-300">Patch data files are syncing or haven’t been generated yet. Please check back shortly.</p>'
            }
        ];

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);
    }
}

function renderPatchHeaderControls() {
    const parentContainer = document.getElementById('patch-sidebar-list')?.parentElement;
    if (!parentContainer) return;

    let controlNav = document.getElementById('patch-type-toggle');
    if (!controlNav) {
        controlNav = document.createElement('div');
        controlNav.id = 'patch-type-toggle';
        controlNav.className = 'grid grid-cols-3 gap-1.5 mb-4 px-2';
        controlNav.innerHTML = `
            <button id="filter-btn-all" onclick="switchPatchFilter('all')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'all' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">All</button>
            <button id="filter-btn-live" onclick="switchPatchFilter('live')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'live' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">Live</button>
            <button id="filter-btn-ptr" onclick="switchPatchFilter('ptr')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'ptr' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">PTR</button>
        `;
        parentContainer.prepend(controlNav);
    }
}

window.switchPatchFilter = function(filterType) {
    if (CURRENT_FILTER === filterType) return;
    CURRENT_FILTER = filterType;
    
    ['all', 'live', 'ptr'].forEach(type => {
        const btn = document.getElementById(`filter-btn-${type}`);
        if (btn) {
            if (type === filterType) {
                btn.className = 'py-1.5 px-2 rounded-lg text-xs font-bold transition border bg-sky-500 text-slate-950 border-sky-400';
            } else {
                btn.className = 'py-1.5 px-2 rounded-lg text-xs font-bold transition border bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800';
            }
        }
    });

    loadLivePatchNotes();
};

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    listContainer.innerHTML = `<h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">${CURRENT_FILTER.toUpperCase()} Feed</h3>`;

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.id = `btn-${item.id}`;
        btn.className = 'w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800/80 transition space-y-1 relative';
        btn.onclick = () => selectPatchItem(item.id);
        
        // Small tag badge to distinguish Live vs PTR when looking at "All"
        const badgeColor = item.feedType === 'ptr' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
        const badgeText = item.feedType ? item.feedType.toUpperCase() : 'NOTE';

        btn.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono text-slate-400">${item.date}</span>
                ${CURRENT_FILTER === 'all' ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ${badgeColor}">${badgeText}</span>` : ''}
            </div>
            <h4 class="text-xs font-bold text-slate-200 line-clamp-2">${item.title}</h4>
        `;
        listContainer.appendChild(btn);
    });
}

function selectPatchItem(id) {
    const item = ACTIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    document.querySelectorAll('#patch-sidebar-list button').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });
    document.getElementById(`btn-${id}`)?.classList.add('bg-sky-500/15', 'border-sky-500/70');

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="space-y-4">
            <div class="border-b border-slate-800 pb-4 space-y-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-sky-400">${item.date}</span>
                    ${item.feedType ? `<span class="text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${item.feedType === 'ptr' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30'}">${item.feedType}</span>` : ''}
                </div>
                <h2 class="text-2xl font-bold text-white">${item.title}</h2>
            </div>
            
            <div class="text-sm text-slate-300 leading-relaxed space-y-3">
                ${item.description}
            </div>

            <div class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${item.link}" target="_blank" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold flex items-center gap-2 transition">
                    View Full Article on Blizzard <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}
