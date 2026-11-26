// ===========================================
// 4. DEEP LINKS, HOME PREVIEWS & PATCH VIEW CONTROLLER
// ===========================================

const VALID_PATCH_FILTERS = ['all', 'live', 'ptr'];
const PATCH_QUERY_KEYS = ['view', 'patch', 'patchId', 'feed'];
const ALLOWED_PATCH_DETAIL_TAGS = new Set([
    'DIV', 'P', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'BR',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
    'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'IMG'
]);
const DANGEROUS_PATCH_TAGS = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON'
]);

let sharedPatchDomParser = null;

const patchState = {
    filter: 'all',
    items: [],
    selectedId: null,
    pendingSelectionId: null,
    homeLatest: { live: null, ptr: null },
    homeHydrated: false,
    homeHydratePromise: null,
    inFlightLoads: new Map(),
    lastRenderedFilter: null,
    lastRenderedSelectionId: null,
    loadSequence: 0,
    detailSequence: 0,
    homeHydrateSequence: 0,
    listenersBound: false
};

function getPatchDomParser() {
    if (typeof DOMParser === 'undefined') return null;
    if (!sharedPatchDomParser) {
        sharedPatchDomParser = new DOMParser();
    }
    return sharedPatchDomParser;
}

function setStatusMessage(el, message, className = 'text-xs text-[#8c83a2] p-3') {
    if (!el) return;
    const div = document.createElement('div');
    div.className = className;
    div.textContent = message;
    el.replaceChildren(div);
}

function sanitizeSafeUrl(rawUrl, { allowDataImage = false } = {}) {
    const val = String(rawUrl || '').trim();
    if (!val) return '';
    if (allowDataImage && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(val)) {
        return val;
    }
    try {
        const parsed = new URL(val, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch (_) {
        // Reject invalid or unsafe URLs
    }
    return '';
}

function sanitizePatchDetailHtml(rawHtml) {
    const htmlStr = String(rawHtml || '');
    if (!htmlStr.trim()) return '';

    const parser = getPatchDomParser();
    if (!parser) {
        return escapeHtml(htmlStr);
    }

    const doc = parser.parseFromString(htmlStr, 'text/html');
    const body = doc.body;
    if (!body) return '';

    const walk = node => {
        const children = Array.from(node.childNodes);
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }

            const tag = child.tagName.toUpperCase();
            if (DANGEROUS_PATCH_TAGS.has(tag)) {
                child.remove();
                continue;
            }

            if (!ALLOWED_PATCH_DETAIL_TAGS.has(tag)) {
                const parent = child.parentNode;
                if (parent) {
                    walk(child);
                    while (child.firstChild) {
                        parent.insertBefore(child.firstChild, child);
                    }
                    child.remove();
                }
                continue;
            }

            const attrs = Array.from(child.attributes);
            for (let j = 0; j < attrs.length; j++) {
                const attr = attrs[j];
                const attrName = attr.name.toLowerCase();
                if (attrName.startsWith('on') || attrName === 'srcdoc') {
                    child.removeAttribute(attr.name);
                    continue;
                }

                if (attrName === 'href') {
                    const safeHref = sanitizeSafeUrl(attr.value, { allowDataImage: false });
                    if (safeHref) {
                        child.setAttribute('href', safeHref);
                        if (tag === 'A') {
                            child.setAttribute('rel', 'noopener noreferrer');
                        }
                    } else {
                        child.removeAttribute('href');
                    }
                    continue;
                }

                if (attrName === 'src') {
                    const safeSrc = sanitizeSafeUrl(attr.value, { allowDataImage: true });
                    if (safeSrc) {
                        child.setAttribute('src', safeSrc);
                    } else {
                        child.removeAttribute('src');
                    }
                }
            }

            walk(child);
        }
    };

    walk(body);
    return body.innerHTML;
}

function normalizePatchFilter(filter) {
    const val = String(filter || '').trim().toLowerCase();
    return VALID_PATCH_FILTERS.includes(val) ? val : 'all';
}

function setPatchFilterState(nextFilter, { syncUrl = false } = {}) {
    const normalized = normalizePatchFilter(nextFilter);
    const filterChanged = patchState.filter !== normalized;
    patchState.filter = normalized;
    if (filterChanged) {
        patchState.selectedId = null;
        patchState.pendingSelectionId = null;
    }
    if (typeof CURRENT_FILTER !== 'undefined') {
        CURRENT_FILTER = normalized;
    }
    if (typeof syncFilterButtonStates === 'function') {
        syncFilterButtonStates();
    }
    if (syncUrl) {
        writePatchUrl(null, { push: false });
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
            if (hPatch || hFeed) {
                return {
                    patchId: hPatch ? String(hPatch).trim() : null,
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
        const normalizedFeed = normalizePatchFilter(filter);
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

function writePatchUrl(item = null, { push = false } = {}) {
    if (typeof window.history?.replaceState !== 'function') return;

    const nextUrl = serializePatchUrl(item, patchState.filter);
    if (window.location.href === nextUrl) return;

    const stateObj = {
        tab: 'patchnotes',
        params: {
            patch: item?.id || null,
            feed: patchState.filter !== 'all' ? patchState.filter : null
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

async function hydrateHomeLatestPatchCards(options = {}) {
    bindHomePatchCards();

    const liveTitle = document.getElementById('home-live-patch-title');
    const liveMeta = document.getElementById('home-live-patch-meta');
    const liveTldr = document.getElementById('home-live-patch-tldr');

    const ptrTitle = document.getElementById('home-ptr-patch-title');
    const ptrMeta = document.getElementById('home-ptr-patch-meta');
    const ptrTldr = document.getElementById('home-ptr-patch-tldr');

    if (!liveTitle && !ptrTitle) return;

    if (!options.force && patchState.homeHydrated) {
        return;
    }
    if (!options.force && patchState.homeHydratePromise) {
        return patchState.homeHydratePromise;
    }

    const hydrateSeq = ++patchState.homeHydrateSequence;

    const runHydration = (async () => {
        try {
            const allPatches = await fetchAllMasterPatches();
            if (hydrateSeq !== patchState.homeHydrateSequence) return;

            const latestLive = allPatches.find(p => p.feedType === 'live') || null;
            const latestPtr = allPatches.find(p => p.feedType === 'ptr') || null;

            patchState.homeLatest.live = latestLive;
            patchState.homeLatest.ptr = latestPtr;

            const shouldFetchLiveNotes = Boolean(liveTitle && latestLive);
            const shouldFetchPtrNotes = Boolean(ptrTitle && latestPtr);

            const [liveNotes, ptrNotes] = await Promise.all([
                shouldFetchLiveNotes ? fetchPatchRawNotesText(latestLive) : Promise.resolve(null),
                shouldFetchPtrNotes ? fetchPatchRawNotesText(latestPtr) : Promise.resolve(null)
            ]);
            if (hydrateSeq !== patchState.homeHydrateSequence) return;

            if (liveTitle) {
                if (latestLive) {
                    liveTitle.textContent = latestLive.title;
                    if (liveMeta) liveMeta.textContent = latestLive.listDate || latestLive.date || 'Live';
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
                    if (ptrTldr) ptrTldr.textContent = buildPatchTldr(latestPtr, ptrNotes);
                } else {
                    ptrTitle.textContent = 'No active PTR patch';
                    if (ptrTldr) ptrTldr.textContent = 'Open Patch Notes to check PTR archive.';
                }
            }

            if (hydrateSeq === patchState.homeHydrateSequence) {
                patchState.homeHydrated = true;
            }
        } catch (_) {
            if (hydrateSeq !== patchState.homeHydrateSequence) return;
            if (liveTitle) liveTitle.textContent = 'Live Patch Notes';
            if (ptrTitle) ptrTitle.textContent = 'PTR Patch Notes';
        } finally {
            if (patchState.homeHydratePromise === runHydration) {
                patchState.homeHydratePromise = null;
            }
        }
    })();

    patchState.homeHydratePromise = runHydration;
    return runHydration;
}

window.openHomePatch = async function openHomePatch(feedType) {
    const normalizedFeed = feedType === 'ptr' ? 'ptr' : 'live';
    const targetPatch = patchState.homeLatest[normalizedFeed];

    setPatchFilterState(normalizedFeed);
    patchState.pendingSelectionId = targetPatch?.id || null;

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

async function loadLivePatchNotes(options = {}) {
    initPatchFilterControls();

    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    const activeFilter = normalizePatchFilter(patchState.filter);
    const desiredId = patchState.pendingSelectionId ?? patchState.selectedId;

    if (
        !options.force &&
        patchState.items.length > 0 &&
        patchState.lastRenderedFilter === activeFilter &&
        desiredId != null &&
        String(patchState.lastRenderedSelectionId) === String(desiredId) &&
        listContainer.children.length > 0
    ) {
        patchState.pendingSelectionId = null;
        schedulePatchSidebarSync();
        return;
    }

    const flightKey = `${activeFilter}::${desiredId != null ? String(desiredId) : ''}`;
    if (!options.force && patchState.inFlightLoads.has(flightKey)) {
        if (desiredId != null) {
            patchState.pendingSelectionId = desiredId;
        }
        return patchState.inFlightLoads.get(flightKey);
    }

    const seq = ++patchState.loadSequence;

    const runLoad = (async () => {
        setStatusMessage(listContainer, 'Loading patch notes...');

        try {
            const allPatches = await fetchAllMasterPatches();
            if (seq !== patchState.loadSequence) return;

            const filtered = filterPatchesByState(allPatches, activeFilter);

            if (filtered.length === 0) {
                setActivePatchItemsState([]);
                patchState.selectedId = null;
                patchState.pendingSelectionId = null;
                patchState.lastRenderedFilter = activeFilter;
                patchState.lastRenderedSelectionId = null;
                setStatusMessage(listContainer, 'No patches found in this feed.');
                setStatusMessage(
                    document.getElementById('patch-main-content'),
                    'No patch notes available.',
                    'p-6 text-[#8c83a2] text-sm'
                );
                schedulePatchSidebarSync();
                return;
            }

            const resolvedDesiredId = patchState.pendingSelectionId ?? patchState.selectedId;
            patchState.pendingSelectionId = null;

            const matchedItem = resolvedDesiredId != null
                ? filtered.find(p => String(p.id) === String(resolvedDesiredId))
                : null;
            const targetId = matchedItem ? matchedItem.id : filtered[0].id;

            setActivePatchItemsState(filtered);
            patchState.lastRenderedFilter = activeFilter;
            patchState.lastRenderedSelectionId = targetId;

            renderPatchSidebar(patchState.items);
            await selectPatchItem(targetId, { loadSeq: seq, syncUrl: false });
        } catch (err) {
            if (seq !== patchState.loadSequence) return;
            patchState.pendingSelectionId = null;
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
            patchState.lastRenderedFilter = activeFilter;
            patchState.lastRenderedSelectionId = fallbackItems[0].id;
            renderPatchSidebar(patchState.items);
            await selectPatchItem(fallbackItems[0].id, { loadSeq: seq, syncUrl: false });
        } finally {
            if (patchState.inFlightLoads.get(flightKey) === runLoad) {
                patchState.inFlightLoads.delete(flightKey);
            }
        }
    })();

    patchState.inFlightLoads.set(flightKey, runLoad);
    return runLoad;
}

async function selectPatchItem(id, options = {}) {
    const expectedLoadSeq = options.loadSeq ?? patchState.loadSequence;
    const shouldSyncUrl = options.syncUrl !== false;

    if (expectedLoadSeq !== patchState.loadSequence) return;

    const item = patchState.items.find(x => String(x.id) === String(id));
    if (!item) return;

    const detailSeq = ++patchState.detailSequence;
    patchState.selectedId = item.id;
    patchState.lastRenderedSelectionId = item.id;

    if (shouldSyncUrl) {
        writePatchUrl(item);
    }

    syncSidebarActiveCardState(item.id);

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    const ctaLabel = 'View Full Article on Blizzard';
    const safeCtaHref = sanitizeSafeUrl(item.link, { allowDataImage: false }) || sanitizeSafeUrl(DEFAULT_HOTS_URL, { allowDataImage: false }) || '#';

    const metaParts = [
        item.era ? `Era <span class="text-[#e6ecff] font-semibold uppercase">${escapeHtml(item.era)}</span>` : null,
        item.patchVersion ? `Patch <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.patchVersion)}</span>` : null,
        item.fullVersion ? `Version <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.fullVersion)}</span>` : null,
        item.build ? `Build <span class="text-[#e6ecff] font-semibold">${escapeHtml(item.build)}</span>` : null
    ].filter(Boolean);

    const feedLabel = item.feedType === 'ptr'
        ? `<span class="hots-list-tag hots-list-tag--gold hots-list-tag--active">${escapeHtml(item.feedType)}</span>`
        : `<span class="hots-list-tag hots-list-tag--cyan hots-list-tag--active">${escapeHtml(item.feedType)}</span>`;

    const archiveLabel = item.isArchive
        ? `<span class="hots-list-tag hots-list-tag--meta hots-list-tag--active">Archive</span>`
        : '';

    mainContent.innerHTML = `
        <article class="space-y-6">
            <header class="border-b border-[#38247a] pb-4 space-y-2">
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-xs font-mono text-[#58baff]">${escapeHtml(item.date)}</span>
                    ${feedLabel}
                    ${archiveLabel}
                </div>
                <h2 class="hots-display text-3xl font-bold tracking-tight">${escapeHtml(item.title)}</h2>
                ${metaParts.length ? `<div class="text-xs font-mono text-[#8c83a2] flex flex-wrap gap-x-4 gap-y-1">${metaParts.join('<span>·</span>')}</div>` : ''}
            </header>

            <div id="patch-notes-body" class="space-y-2">
                <div class="text-xs text-[#8c83a2] py-2">Loading patch notes...</div>
            </div>

            <footer class="pt-4 border-t border-[#38247a] flex justify-end">
                <a href="${escapeHtml(safeCtaHref)}" target="_blank" rel="noopener noreferrer" class="hots-btn-cyan hots-display px-4 py-2 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 transition">
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
        bodyEl.innerHTML = sanitizePatchDetailHtml(notesHtml);
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
        hydrateHomeLatestPatchCards({ force: Boolean(initialState.force) });
    }

    const urlLink = initialState.openView && !initialState.patchId && !initialState.feed
        ? readPatchDeepLinkFromUrl()
        : null;

    const effectiveFeed = initialState.feed || urlLink?.feed || null;
    const effectivePatchId = initialState.patchId || urlLink?.patchId || null;

    if (effectiveFeed) {
        setPatchFilterState(effectiveFeed);
    }
    if (effectivePatchId) {
        patchState.pendingSelectionId = effectivePatchId;
    }

    if (initialState.openView) {
        const alreadyLoadedSameView =
            !initialState.force &&
            patchState.items.length > 0 &&
            patchState.lastRenderedFilter === patchState.filter &&
            (!effectivePatchId || String(patchState.lastRenderedSelectionId) === String(effectivePatchId));

        if (!alreadyLoadedSameView) {
            loadLivePatchNotes({ force: Boolean(initialState.force) });
        }
    }

    schedulePatchSidebarSync();
}