// ===========================================
// 4. DEEP LINKS, HOME PREVIEWS & PATCH VIEW CONTROLLER
// ===========================================

const VALID_PATCH_FILTERS = ['all', 'live', 'ptr'];
const PATCH_QUERY_KEYS = ['view', 'patch', 'patchId', 'feed'];

const patchState = {
    filter: 'all',
    items: [],
    selectedId: null,
    homeLatest: { live: null, ptr: null },
    pendingDeepLink: null,
    manualFilterLock: false,
    loadSequence: 0,
    detailSequence: 0,
    homeHydrateSequence: 0,
    listenersBound: false
};

function normalizePatchFilter(filter) {
    const val = String(filter || '').trim().toLowerCase();
    return VALID_PATCH_FILTERS.includes(val) ? val : 'all';
}

function setPatchFilterState(nextFilter) {
    const normalized = normalizePatchFilter(nextFilter);
    patchState.filter = normalized;
    if (typeof CURRENT_FILTER !== 'undefined') {
        CURRENT_FILTER = normalized;
    }
    if (typeof syncFilterButtonStates === 'function') {
        syncFilterButtonStates();
    }
    return normalized;
}

function setActivePatchItemsState(items) {
    const nextItems = Array.isArray(items) ? items : [];
    patchState.items = nextItems;
    return nextItems;
}

function readPatchDeepLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const queryPatch = params.get('patch') || params.get('patchId') || params.get('id');
    const queryFeed = params.get('feed');
    const queryView = params.get('view');

    if (queryPatch) {
        return {
            patchId: String(queryPatch).trim(),
            feed: queryFeed ? normalizePatchFilter(queryFeed) : null,
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
                    feed: hFeed ? normalizePatchFilter(hFeed) : null,
                    openView: true
                };
            }
        }
        return { patchId: null, feed: null, openView: true };
    }

    return null;
}

function serializePatchUrl(item = null, filter = patchState.filter) {
    try {
        const url = new URL(window.location.href);
        for (const key of PATCH_QUERY_KEYS) {
            url.searchParams.delete(key);
        }

        const hashParams = new URLSearchParams();
        if (item && item.id) {
            hashParams.set('patch', String(item.id));
        }
        const normalizedFeed = item?.feedType
            ? normalizePatchFilter(item.feedType)
            : normalizePatchFilter(filter);
        if (normalizedFeed && normalizedFeed !== 'all') {
            hashParams.set('feed', normalizedFeed);
        }

        const queryStr = hashParams.toString();
        url.hash = queryStr ? `#patchnotes?${queryStr}` : '#patchnotes';
        return url.toString();
    } catch (_) {
        return '#patchnotes';
    }
}

function writePatchUrl(item, { push = false } = {}) {
    if (!item || !item.id || typeof window.history?.replaceState !== 'function') return;

    const nextUrl = serializePatchUrl(item);
    if (window.location.href === nextUrl) return;

    const stateObj = {
        tab: 'patchnotes',
        params: {
            patch: item.id,
            feed: item.feedType || null
        }
    };

    try {
        if (push && typeof window.history?.pushState === 'function') {
            window.history.pushState(stateObj, '', nextUrl);
        } else {
            window.history.replaceState(stateObj, '', nextUrl);
        }
    } catch (_) {
        // Ignore history state errors on restricted origins
    }
}

async function hydrateHomeLatestPatchCards() {
    bindHomePatchCards();

    const liveTitle = document.getElementById('home-live-patch-title');
    const liveMeta = document.getElementById('home-live-patch-meta');
    const liveTldr = document.getElementById('home-live-patch-tldr');

    const ptrTitle = document.getElementById('home-ptr-patch-title');
    const ptrMeta = document.getElementById('home-ptr-patch-meta');
    const ptrTldr = document.getElementById('home-ptr-patch-tldr');

    if (!liveTitle && !ptrTitle) return;

    const hydrateSeq = ++patchState.homeHydrateSequence;

    try {
        const allPatches = await fetchAllMasterPatches();
        if (hydrateSeq !== patchState.homeHydrateSequence) return;

        const latestLive = allPatches.find(p => p.feedType === 'live') || null;
        const latestPtr = allPatches.find(p => p.feedType === 'ptr') || null;

        patchState.homeLatest.live = latestLive;
        patchState.homeLatest.ptr = latestPtr;

        if (liveTitle) {
            if (latestLive) {
                liveTitle.textContent = latestLive.title;
                if (liveMeta) liveMeta.textContent = latestLive.listDate || latestLive.date || 'Live';
                const liveNotes = await fetchPatchRawNotesText(latestLive);
                if (hydrateSeq !== patchState.homeHydrateSequence) return;
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
                if (hydrateSeq !== patchState.homeHydrateSequence) return;
                if (ptrTldr) ptrTldr.textContent = buildPatchTldr(latestPtr, ptrNotes);
            } else {
                ptrTitle.textContent = 'No active PTR patch';
                if (ptrTldr) ptrTldr.textContent = 'Open Patch Notes to check PTR archive.';
            }
        }
    } catch (_) {
        if (hydrateSeq !== patchState.homeHydrateSequence) return;
        if (liveTitle) liveTitle.textContent = 'Live Patch Notes';
        if (ptrTitle) ptrTitle.textContent = 'PTR Patch Notes';
    }
}

window.openHomePatch = async function openHomePatch(feedType) {
    const normalizedFeed = feedType === 'ptr' ? 'ptr' : 'live';
    const targetPatch = patchState.homeLatest[normalizedFeed];

    patchState.manualFilterLock = false;
    setPatchFilterState(normalizedFeed);
    patchState.pendingDeepLink = targetPatch
        ? { patchId: targetPatch.id, feed: normalizedFeed, openView: true }
        : { patchId: null, feed: normalizedFeed, openView: true };

    if (typeof navigateTo === 'function') {
        navigateTo('patchnotes', {
            ...(targetPatch?.id ? { patch: targetPatch.id } : {}),
            feed: normalizedFeed
        });
    } else {
        await loadLivePatchNotes();
    }
};

function filterPatchesByState(allPatches, filter) {
    if (filter === 'live') {
        return allPatches.filter(item => item.feedType === 'live');
    }
    if (filter === 'ptr') {
        return allPatches.filter(item => item.feedType === 'ptr');
    }
    return allPatches;
}

async function loadLivePatchNotes() {
    initPatchFilterControls();

    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    const seq = ++patchState.loadSequence;
    const honorDeepLink = !patchState.manualFilterLock;
    const activeDeepLink = honorDeepLink
        ? (patchState.pendingDeepLink || readPatchDeepLinkFromUrl())
        : null;

    if (activeDeepLink?.feed && !patchState.pendingDeepLink) {
        setPatchFilterState(activeDeepLink.feed);
    }

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[#9cb6ff]">${escapeHtml(patchState.filter)} Feed</h3>
        </div>
        <div class="text-xs text-[#8c83a2] p-3">Loading patch notes...</div>
    `;

    schedulePatchSidebarSync();

    try {
        const allPatches = await fetchAllMasterPatches();
        if (seq !== patchState.loadSequence) return;

        let filtered = filterPatchesByState(allPatches, patchState.filter);

        if (filtered.length === 0) {
            setActivePatchItemsState([]);
            patchState.manualFilterLock = false;
            listContainer.innerHTML = `
                <div class="flex items-center justify-between px-2 pb-2">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-[#9cb6ff]">${escapeHtml(patchState.filter)} Feed</h3>
                    <span class="text-[10px] font-mono text-[#8c83a2]">0</span>
                </div>
                <div class="text-xs text-[#8c83a2] p-3">No patches found in this feed.</div>
            `;
            const mainContent = document.getElementById('patch-main-content');
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-6 text-[#8c83a2] text-sm">No patch notes available.</div>`;
            }
            schedulePatchSidebarSync();
            return;
        }

        let targetId = filtered[0].id;
        if (activeDeepLink?.patchId) {
            const matchedInList = filtered.find(p => String(p.id) === String(activeDeepLink.patchId));
            if (matchedInList) {
                targetId = matchedInList.id;
            } else {
                const matchedAnywhere = allPatches.find(p => String(p.id) === String(activeDeepLink.patchId));
                if (matchedAnywhere) {
                    setPatchFilterState('all');
                    filtered = allPatches;
                    targetId = matchedAnywhere.id;
                }
            }
        }

        if (seq !== patchState.loadSequence) return;

        setActivePatchItemsState(filtered);
        patchState.pendingDeepLink = null;
        patchState.manualFilterLock = false;

        renderPatchSidebar(patchState.items);
        await selectPatchItem(targetId, { loadSeq: seq, syncUrl: false });
    } catch (err) {
        if (seq !== patchState.loadSequence) return;
        patchState.manualFilterLock = false;
        console.warn('Failed to load patch notes:', err);

        const fallbackItems = [
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
        setActivePatchItemsState(fallbackItems);
        renderPatchSidebar(patchState.items);
        await selectPatchItem(fallbackItems[0].id, { loadSeq: seq, syncUrl: false });
    }
}

async function selectPatchItem(id, options = {}) {
    const expectedLoadSeq = options.loadSeq ?? patchState.loadSequence;
    const shouldSyncUrl = options.syncUrl !== false;

    if (expectedLoadSeq !== patchState.loadSequence) return;

    const item = patchState.items.find(x => String(x.id) === String(id));
    if (!item) return;

    const detailSeq = ++patchState.detailSequence;
    patchState.selectedId = item.id;

    if (shouldSyncUrl) {
        writePatchUrl(item);
    }

    syncSidebarActiveCardState(item.id);

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    const ctaLabel = 'View Full Article on Blizzard';

    const metaParts = [
        item.era ? `Era <span class="text-[#e6ecff] font-semibold uppercase">${escapeHtml(item.era)}</span>` : null,
        item.patchVersion ? `Patch <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.patchVersion)}</span>` : null,
        item.fullVersion ? `Version <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.fullVersion)}</span>` : null,
        item.build ? `Build <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.build)}</span>` : null
    ].filter(Boolean);

    const feedBadge = item.feedType === 'ptr'
        ? `<span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase text-[#ffeab6] bg-[#e38b0d]/20 border border-[#fed600]/40">${escapeHtml(item.feedType)}</span>`
        : `<span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase text-[#cbe8ff] bg-[#0063c8]/25 border border-[#58baff]/40">${escapeHtml(item.feedType)}</span>`;

    mainContent.innerHTML = `
        <article class="space-y-6">
            <header class="border-b border-[#38247a] pb-4 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-mono text-[#58baff]">${escapeHtml(item.date)}</span>
                    ${feedBadge}
                    ${item.isArchive ? `<span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase text-[#9cb6ff] bg-[#120b2e] border border-[#38247a]">Archive</span>` : ''}
                </div>
                <h2 class="hots-display text-3xl font-bold tracking-tight">${escapeHtml(item.title)}</h2>
                ${metaParts.length ? `<div class="text-xs font-mono text-[#8c83a2] flex flex-wrap gap-x-4 gap-y-1">${metaParts.join('<span>·</span>')}</div>` : ''}
            </header>

            <div id="patch-notes-body" class="space-y-2">
                <div class="text-xs text-[#8c83a2] py-2">Loading patch notes...</div>
            </div>

            <footer class="pt-4 border-t border-[#38247a] flex justify-end">
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="hots-btn-cyan hots-display px-4 py-2 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 transition">
                    ${escapeHtml(ctaLabel)} <i data-lucide="external-link" class="w-3.5 h-3.5" aria-hidden="true"></i>
                </a>
            </footer>
        </article>
    `;

    if (window.lucide) lucide.createIcons();

    const notesHtml = await fetchPatchDetailHtml(item);
    if (
        expectedLoadSeq !== patchState.loadSequence ||
        detailSeq !== patchState.detailSequence ||
        String(patchState.selectedId) !== String(item.id)
    ) {
        return;
    }

    const bodyEl = document.getElementById('patch-notes-body');
    if (bodyEl && patchState.items.some(x => String(x.id) === String(item.id))) {
        bodyEl.innerHTML = notesHtml;
    }

    schedulePatchSidebarSync();
}

function bindHomePatchCards() {
    document.querySelectorAll('[data-home-patch]').forEach(card => {
        if (card.dataset.homePatchBound === 'true') return;
        card.dataset.homePatchBound = 'true';

        const feed = card.getAttribute('data-home-patch');
        card.addEventListener('click', () => window.openHomePatch(feed));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.openHomePatch(feed);
            }
        });
    });
}

function bindPatchGlobalListeners() {
    bindHomePatchCards();
    if (patchState.listenersBound) return;
    patchState.listenersBound = true;

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
        patchState.manualFilterLock = false;
        patchState.pendingDeepLink = {
            patchId: initialState.patchId || null,
            feed: initialState.feed ? normalizePatchFilter(initialState.feed) : null,
            openView: Boolean(initialState.openView)
        };
        if (initialState.feed) {
            setPatchFilterState(initialState.feed);
        }
    }

    if (initialState.openView) {
        loadLivePatchNotes();
    }

    schedulePatchSidebarSync();
}
