// ==========================================
// PATCH NOTES MODULE (FILTERABLE & CHRONOLOGICAL)
// ==========================================

let CURRENT_FILTER = 'all'; // 'all', 'live', or 'ptr'
let ACTIVE_PATCH_ITEMS = [];

const PATCH_DATA_DIR = './data/patchnotes';

function parsePatchTimestamp(item) {
    const candidates = [item?.isoDate, item?.liveDate, item?.date];
    for (const raw of candidates) {
        if (!raw) continue;
        const ts = Date.parse(raw);
        if (!Number.isNaN(ts)) return ts;
    }
    return 0;
}

function formatPatchDisplayDate(rawDate, fallback = 'Unknown Date') {
    if (!rawDate) return fallback;
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return String(rawDate);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function normalizeCurrentPatch(item, defaultFeedType) {
    if (!item || typeof item !== 'object') return null;

    const rawDate = item.isoDate || item.date || null;
    const feedType = item.feedType === 'ptr' || item.feedType === 'live'
        ? item.feedType
        : defaultFeedType;

    return {
        ...item,
        id: String(item.id || `${feedType}-${item.title || 'patch'}`),
        title: String(item.title || 'Untitled Patch').trim(),
        date: item.date || formatPatchDisplayDate(rawDate),
        isoDate: item.isoDate || (rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null),
        feedType,
        isLegacy: Boolean(item.isLegacy),
        link: item.link || 'https://news.blizzard.com/en-us/heroes-of-the-storm',
        description: item.description || `<p class="text-slate-300">${item.title || 'Patch notes update.'}</p>`
    };
}

function normalizeLegacyPatch(item, index) {
    if (!item || typeof item !== 'object') return null;

    const title = String(item.patchName || item.internalId || `Legacy Patch #${index + 1}`).trim();
    const rawDate = item.liveDate || item.date || null;
    const ts = rawDate ? Date.parse(rawDate) : NaN;
    const validDate = !Number.isNaN(ts) ? new Date(ts) : null;

    const combinedType = `${item.patchType || ''} ${title}`.toLowerCase();
    const feedType = combinedType.includes('ptr') ? 'ptr' : 'live';

    const officialUrl = typeof item.officialLink === 'string' && item.officialLink.trim()
        ? item.officialLink.trim()
        : '';
    const altUrl = typeof item.alternateLink === 'string' && item.alternateLink.trim()
        ? item.alternateLink.trim()
        : '';
    const link = officialUrl || altUrl || 'https://news.blizzard.com/en-us/heroes-of-the-storm';

    const details = [
        item.patchType ? `<span class="text-slate-200 font-semibold">${item.patchType}</span>` : null,
        (item.fullVersion || item.gameVersion) ? `Version ${item.fullVersion || item.gameVersion}` : null,
        item.liveBuild ? `Build ${item.liveBuild}` : null,
        !officialUrl && altUrl ? 'Source: Alternate / Community Archive' : null
    ].filter(Boolean);

    const summaryText = details.length
        ? details.join(' · ')
        : 'Historical Heroes of the Storm patch archive entry (2014–2021).';

    return {
        id: item.internalId ? String(item.internalId) : `legacy-${index}`,
        title,
        date: validDate ? formatPatchDisplayDate(validDate.toISOString()) : (rawDate || 'Unknown Date'),
        isoDate: validDate ? validDate.toISOString() : null,
        feedType,
        isLegacy: true,
        link,
        description: `<p class="text-slate-300">${summaryText}</p>`
    };
}

function deduplicateAndSortPatches(items) {
    const seen = new Map();

    for (const item of items) {
        if (!item) continue;
        const key = item.link && !item.link.includes('news.blizzard.com/en-us/heroes-of-the-storm')
            ? `link:${item.link.trim().toLowerCase()}`
            : `id:${String(item.id).trim().toLowerCase()}`;

        // Prefer non-legacy or richer entries if both exist for the same key
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, item);
        } else if (existing.isLegacy && !item.isLegacy) {
            seen.set(key, item);
        }
    }

    return Array.from(seen.values()).sort((a, b) => {
        const diff = parsePatchTimestamp(b) - parsePatchTimestamp(a);
        if (diff !== 0) return diff;
        return String(b.id).localeCompare(String(a.id));
    });
}

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    renderPatchHeaderControls();

    listContainer.innerHTML = `
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">
            ${CURRENT_FILTER.toUpperCase()} Updates
        </h3>
        <div class="text-xs text-sky-400 p-3 animate-pulse">Loading updates...</div>
    `;

    try {
        const [liveRes, ptrRes, legacyRes] = await Promise.all([
            fetch(`${PATCH_DATA_DIR}/live-patches.json`).catch(() => ({ ok: false })),
            fetch(`${PATCH_DATA_DIR}/ptr-patches.json`).catch(() => ({ ok: false })),
            fetch(`${PATCH_DATA_DIR}/legacy-patches2014-2021.json`).catch(() => ({ ok: false }))
        ]);

        let liveItems = [];
        let ptrItems = [];
        let legacyItems = [];

        if (liveRes.ok) {
            const data = await liveRes.json();
            liveItems = (Array.isArray(data) ? data : [])
                .map(item => normalizeCurrentPatch(item, 'live'))
                .filter(Boolean);
        }

        if (ptrRes.ok) {
            const data = await ptrRes.json();
            ptrItems = (Array.isArray(data) ? data : [])
                .map(item => normalizeCurrentPatch(item, 'ptr'))
                .filter(Boolean);
        }

        if (legacyRes.ok) {
            const data = await legacyRes.json();
            const rows = Array.isArray(data) ? data : (Array.isArray(data?.patches) ? data.patches : []);
            legacyItems = rows
                .map((item, idx) => normalizeLegacyPatch(item, idx))
                .filter(Boolean);
        }

        const combinedAll = deduplicateAndSortPatches([
            ...liveItems,
            ...ptrItems,
            ...legacyItems
        ]);

        if (CURRENT_FILTER === 'live') {
            ACTIVE_PATCH_ITEMS = combinedAll.filter(item => item.feedType === 'live');
        } else if (CURRENT_FILTER === 'ptr') {
            ACTIVE_PATCH_ITEMS = combinedAll.filter(item => item.feedType === 'ptr');
        } else {
            ACTIVE_PATCH_ITEMS = combinedAll;
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

        const badgeColor = item.feedType === 'ptr'
            ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
            : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
        const badgeText = item.feedType ? item.feedType.toUpperCase() : 'NOTE';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-mono text-slate-400">${item.date}</span>
                <div class="flex items-center gap-1">
                    ${item.isLegacy ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono text-slate-300 bg-slate-800/80 border-slate-700">LEGACY</span>` : ''}
                    ${CURRENT_FILTER === 'all' ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ${badgeColor}">${badgeText}</span>` : ''}
                </div>
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

    const ctaLabel = item.isLegacy && item.link.includes('reddit.com')
        ? 'View Source Thread on Reddit'
        : 'View Full Article on Blizzard';

    mainContent.innerHTML = `
        <div class="space-y-4">
            <div class="border-b border-slate-800 pb-4 space-y-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-sky-400">${item.date}</span>
                    ${item.feedType ? `<span class="text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${item.feedType === 'ptr' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30'}">${item.feedType}</span>` : ''}
                    ${item.isLegacy ? `<span class="text-[10px] px-2 py-0.5 rounded border font-mono uppercase text-slate-300 bg-slate-800/80 border-slate-700">2014–2021 Archive</span>` : ''}
                </div>
                <h2 class="text-2xl font-bold text-white">${item.title}</h2>
            </div>

            <div class="text-sm text-slate-300 leading-relaxed space-y-3">
                ${item.description}
            </div>

            <div class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold flex items-center gap-2 transition">
                    ${ctaLabel} <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}
