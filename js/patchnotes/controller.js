// ==========================================
// 4. DEEP LINKS, HOME PREVIEWS & PATCH VIEW CONTROLLER
// ==========================================

let patchNotesInitialized = false;

function readPatchDeepLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const queryPatch = params.get('patch') || params.get('patchId') || params.get('id');
    const queryFeed = params.get('feed');
    const queryView = params.get('view');

    if (queryPatch) {
        return {
            patchId: String(queryPatch).trim(),
            feed: queryFeed ? String(queryFeed).trim().toLowerCase() : null,
            openView: queryView === 'patchnotes' || !queryView
        };
    }

    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (hash.startsWith('patchnotes')) {
        const qIndex = hash.indexOf('?');
        if (qIndex !== -1) {
            const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
            const hPatch = hashParams.get('patch') || hashParams.get('id');
            const hFeed = hashParams.get('feed');
            if (hPatch) {
                return {
                    patchId: String(hPatch).trim(),
                    feed: hFeed ? String(hFeed).trim().toLowerCase() : null,
                    openView: true
                };
            }
        }
        return { patchId: null, feed: null, openView: true };
    }

    return null;
}

function writePatchUrl(item) {
    if (!item || typeof window.history?.replaceState !== 'function') return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'patchnotes');
        url.searchParams.set('patch', item.id);
        if (item.feedType) {
            url.searchParams.set('feed', item.feedType);
        }
        url.hash = '#patchnotes';
        window.history.replaceState(
            { tab: 'patchnotes', view: 'patchnotes', patchId: item.id, feedType: item.feedType },
            '',
            url.toString()
        );
    } catch (_) {
        // Ignore history state errors on restricted origins
    }
}

async function hydrateHomeLatestPatchCards() {
    const liveTitle = document.getElementById('home-live-patch-title');
    const liveMeta = document.getElementById('home-live-patch-meta');
    const liveTldr = document.getElementById('home-live-patch-tldr');

    const ptrTitle = document.getElementById('home-ptr-patch-title');
    const ptrMeta = document.getElementById('home-ptr-patch-meta');
    const ptrTldr = document.getElementById('home-ptr-patch-tldr');

    if (!liveTitle && !ptrTitle) return;

    try {
        const allPatches = await fetchAllMasterPatches();
        const latestLive = allPatches.find(p => p.feedType === 'live') || null;
        const latestPtr = allPatches.find(p => p.feedType === 'ptr') || null;

        HOME_LATEST_PATCHES.live = latestLive;
        HOME_LATEST_PATCHES.ptr = latestPtr;

        if (liveTitle) {
            if (latestLive) {
                liveTitle.textContent = latestLive.title;
                if (liveMeta) liveMeta.textContent = latestLive.listDate || latestLive.date || 'Live';
                const liveNotes = await fetchPatchRawNotesText(latestLive);
                if (liveTldr) liveTldr.textContent = buildPatchTldr(latestLive, liveNotes);
            } else {
                liveTitle.textContent = 'No live patch recorded';
                if (liveTldr) liveTldr.textContent = 'Open Patch Notes to browse all feeds.';
            }
        }

        if (ptrTitle) {
            if (latestPtr) {
                ptrTitle.textContent = latestPtr.title;
                if (ptrMeta) ptrMeta.textContent = latestPtr.listDate || latestPtr.date || 'PTR';
                const ptrNotes = await fetchPatchRawNotesText(latestPtr);
                if (ptrTldr) ptrTldr.textContent = buildPatchTldr(latestPtr, ptrNotes);
            } else {
                ptrTitle.textContent = 'No active PTR patch';
                if (ptrTldr) ptrTldr.textContent = 'Open Patch Notes to check PTR archive.';
            }
        }
    } catch (_) {
        if (liveTitle) liveTitle.textContent = 'Live Patch Notes';
        if (ptrTitle) ptrTitle.textContent = 'PTR Patch Notes';
    }
}

window.openHomePatch = async function openHomePatch(feedType) {
    const normalizedFeed = feedType === 'ptr' ? 'ptr' : 'live';
    const targetPatch = HOME_LATEST_PATCHES[normalizedFeed];

    CURRENT_FILTER = normalizedFeed;
    syncFilterButtonStates();

    if (targetPatch) {
        PENDING_DEEP_LINK_PATCH = {
            patchId: targetPatch.id,
            feed: normalizedFeed,
            openView: true
        };
    }

    if (typeof navigateTo === 'function') {
        navigateTo('patchnotes');
    }

    await loadLivePatchNotes();
};

async function loadLivePatchNotes() {
    initPatchFilterControls();

    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    const deepLink = PENDING_DEEP_LINK_PATCH || readPatchDeepLinkFromUrl();
    if (deepLink?.feed && ['all', 'live', 'ptr'].includes(deepLink.feed) && !PENDING_DEEP_LINK_PATCH) {
        CURRENT_FILTER = deepLink.feed;
        syncFilterButtonStates();
    }

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER)} Feed</h3>
        </div>
        <div class="text-xs text-slate-400 p-3">Loading patch notes...</div>
    `;

    schedulePatchSidebarSync();

    try {
        const allPatches = await fetchAllMasterPatches();

        if (CURRENT_FILTER === 'live') {
            ACTIVE_PATCH_ITEMS = allPatches.filter(item => item.feedType === 'live');
        } else if (CURRENT_FILTER === 'ptr') {
            ACTIVE_PATCH_ITEMS = allPatches.filter(item => item.feedType === 'ptr');
        } else {
            ACTIVE_PATCH_ITEMS = allPatches;
        }

        if (ACTIVE_PATCH_ITEMS.length === 0) {
            listContainer.innerHTML = `
                <div class="flex items-center justify-between px-2 pb-2">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER)} Feed</h3>
                    <span class="text-[10px] font-mono text-slate-500">0</span>
                </div>
                <div class="text-xs text-slate-400 p-3">No patches found in this feed.</div>
            `;
            const mainContent = document.getElementById('patch-main-content');
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-6 text-slate-400 text-sm">No patch notes available.</div>`;
            }
            schedulePatchSidebarSync();
            return;
        }

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);

        let targetId = ACTIVE_PATCH_ITEMS[0].id;
        if (deepLink?.patchId) {
            const matchedInList = ACTIVE_PATCH_ITEMS.find(p => String(p.id) === String(deepLink.patchId));
            if (matchedInList) {
                targetId = matchedInList.id;
            } else {
                const matchedAnywhere = allPatches.find(p => String(p.id) === String(deepLink.patchId));
                if (matchedAnywhere) {
                    CURRENT_FILTER = 'all';
                    ACTIVE_PATCH_ITEMS = allPatches;
                    syncFilterButtonStates();
                    renderPatchSidebar(ACTIVE_PATCH_ITEMS);
                    targetId = matchedAnywhere.id;
                }
            }
        }

        PENDING_DEEP_LINK_PATCH = null;
        await selectPatchItem(targetId);

    } catch (err) {
        console.warn('Failed to load patch notes:', err);
        ACTIVE_PATCH_ITEMS = [
            {
                id: 'fallback-feed',
                title: 'Heroes of the Storm Live Patch Notes',
                date: 'Recent',
                listDate: 'Recent',
                feedType: 'live',
                era: 'live',
                isArchive: false,
                link: DEFAULT_HOTS_URL,
                inlineNotes: 'Patch feeds are syncing. Please check back shortly.'
            }
        ];
        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);
    }
}

async function selectPatchItem(id) {
    const item = ACTIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    writePatchUrl(item);

    document.querySelectorAll('#patch-sidebar-list button[id^="btn-"]').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });

    const activeBtn = document.getElementById(`btn-${CSS.escape(id)}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-sky-500/15', 'border-sky-500/70');
    }

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    const ctaLabel = 'View Full Article on Blizzard';

    const metaParts = [
        item.era ? `Era <span class="text-slate-200 font-semibold uppercase">${escapeHtml(item.era)}</span>` : null,
        item.patchVersion ? `Patch <span class="text-slate-200 font-semibold">${escapeHtml(item.patchVersion)}</span>` : null,
        item.fullVersion ? `Version <span class="text-slate-200 font-semibold">${escapeHtml(item.fullVersion)}</span>` : null,
        item.build ? `Build <span class="text-slate-200 font-semibold">${escapeHtml(item.build)}</span>` : null
    ].filter(Boolean);

    mainContent.innerHTML = `
        <article class="space-y-6">
            <header class="border-b border-slate-800 pb-4 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-mono text-sky-400">${escapeHtml(item.date)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase ${item.feedType === 'ptr' ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30' : 'text-sky-300 bg-sky-500/15 border border-sky-500/30'}">${escapeHtml(item.feedType)}</span>
                    ${item.isArchive ? `<span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase text-slate-300 bg-slate-800 border border-slate-700">Archive</span>` : ''}
                </div>
                <h2 class="text-3xl font-bold text-white tracking-tight">${escapeHtml(item.title)}</h2>
                ${metaParts.length ? `<div class="text-xs font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">${metaParts.join('<span>·</span>')}</div>` : ''}
            </header>

            <div id="patch-notes-body" class="space-y-2">
                <div class="text-xs text-slate-400 py-2">Loading patch notes...</div>
            </div>

            <footer class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold inline-flex items-center gap-2 transition">
                    ${escapeHtml(ctaLabel)} <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </footer>
        </article>
    `;

    if (window.lucide) lucide.createIcons();

    const notesHtml = await fetchPatchDetailHtml(item);
    const bodyEl = document.getElementById('patch-notes-body');
    if (bodyEl && ACTIVE_PATCH_ITEMS.some(x => x.id === id)) {
        bodyEl.innerHTML = notesHtml;
    }

    schedulePatchSidebarSync();
}

function bindPatchGlobalListeners() {
    if (patchNotesInitialized) return;
    patchNotesInitialized = true;

    window.addEventListener('scroll', schedulePatchSidebarSync, { passive: true });
    window.addEventListener('resize', schedulePatchSidebarSync, { passive: true });

    const patchViewEl = document.getElementById('view-patchnotes');
    if (patchViewEl && typeof MutationObserver !== 'undefined') {
        const patchViewObserver = new MutationObserver(schedulePatchSidebarSync);
        patchViewObserver.observe(patchViewEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }
}

function initPatchNotes(initialState = {}) {
    bindPatchGlobalListeners();
    initPatchFilterControls();

    if (initialState.hydrateHome) {
        hydrateHomeLatestPatchCards();
    }

    if (initialState.patchId || initialState.feed) {
        PENDING_DEEP_LINK_PATCH = {
            patchId: initialState.patchId || null,
            feed: initialState.feed || null,
            openView: Boolean(initialState.openView)
        };
        if (initialState.feed && ['all', 'live', 'ptr'].includes(String(initialState.feed).toLowerCase())) {
            CURRENT_FILTER = String(initialState.feed).toLowerCase();
            syncFilterButtonStates();
        }
    }

    if (initialState.openView) {
        loadLivePatchNotes();
    }

    schedulePatchSidebarSync();
}
