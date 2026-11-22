function formatBlizzlikePatchNotesHtml(rawText) {
    if (!rawText) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const normalized = normalizeBlizzlikePatchText(rawText).trim();
    if (!normalized) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const lines = normalized.split('\n');
    const htmlParts = [];
    let listStack = [];
    let isFirstMajorHeading = true;

    const listStyleByDepth = [
        'list-disc pl-5 space-y-1.5 text-[14px] text-slate-200 marker:text-sky-400/80',
        'list-[circle] pl-5 mt-1.5 space-y-1 text-[13.5px] text-slate-300 marker:text-slate-500',
        'list-[square] pl-5 mt-1 space-y-1 text-[13px] text-slate-400 marker:text-slate-600'
    ];

    function renderNode(node, depth = 0) {
        const ulClass = listStyleByDepth[Math.min(depth, listStyleByDepth.length - 1)];
        const itemsHtml = node.items.map(item => {
            const nestedHtml = item.children.length
                ? renderNode({ indent: item.indent + 1, items: item.children }, depth + 1)
                : '';
            return `<li class="leading-relaxed">${formatBlizzLine(item.text)}${nestedHtml}</li>`;
        }).join('');
        return `<ul class="${ulClass}">${itemsHtml}</ul>`;
    }

    function flushList() {
        if (!listStack.length) return;
        htmlParts.push(renderNode(listStack[0], 0));
        listStack = [];
    }

    function addBullet(text, indentLevel) {
        if (!listStack.length) {
            listStack.push({ indent: indentLevel, items: [{ indent: indentLevel, text, children: [] }] });
            return;
        }

        const top = listStack[listStack.length - 1];
        if (indentLevel > top.indent) {
            const parentItems = top.items;
            const lastParent = parentItems[parentItems.length - 1];
            const childItem = { indent: indentLevel, text, children: [] };
            if (lastParent) {
                lastParent.children.push(childItem);
                listStack.push({ indent: indentLevel, items: lastParent.children });
            } else {
                parentItems.push(childItem);
            }
        } else {
            while (listStack.length > 1 && indentLevel < listStack[listStack.length - 1].indent) {
                listStack.pop();
            }
            listStack[listStack.length - 1].items.push({ indent: indentLevel, text, children: [] });
        }
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            flushList();
            continue;
        }

        const majorMatch = trimmed.match(/^={2,}\s*(.+?)\s*={2,}$/);
        if (majorMatch) {
            flushList();
            const headingText = majorMatch[1].trim();
            const newHeroMatch = headingText.match(/^New Hero:\s*(.+)$/i);
            const heroMatch = headingText.match(/^Heroes:\s*(.+)$/i);

            if (newHeroMatch) {
                const topSpacing = isFirstMajorHeading ? 'pt-1 mt-0 border-t-0' : 'pt-7 mt-6 border-t border-slate-800';
                isFirstMajorHeading = false;
                htmlParts.push(
                    `<div class="${topSpacing} pb-1">
                        <span class="block text-[11px] font-mono font-bold uppercase tracking-widest text-amber-300/90 mb-1">New Hero</span>
                        <h2 class="text-2xl font-bold text-white tracking-tight">${escapeHtml(newHeroMatch[1].trim())}</h2>
                    </div>`
                );
            } else if (heroMatch) {
                htmlParts.push(
                    `<h3 class="text-xl font-bold text-sky-200 pt-5 pb-1 mt-4 border-t border-slate-800/80 tracking-tight">${escapeHtml(heroMatch[1].trim())}</h3>`
                );
            } else {
                const topSpacing = isFirstMajorHeading ? 'pt-1 mt-0 border-t-0' : 'pt-7 mt-6 border-t border-slate-800';
                isFirstMajorHeading = false;
                htmlParts.push(
                    `<h2 class="text-2xl font-bold text-white ${topSpacing} pb-1.5 tracking-tight">${escapeHtml(headingText)}</h2>`
                );
            }
            continue;
        }

        const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*$/);
        if (bracketMatch) {
            flushList();
            const label = bracketMatch[1].trim();
            htmlParts.push(
                `<h4 class="text-base font-bold text-slate-100 pt-3.5 pb-0.5">${escapeHtml(label)}</h4>`
            );
            continue;
        }

        const bulletMatch = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (bulletMatch) {
            const spaces = bulletMatch[1].replace(/\t/g, '  ').length;
            const indentLevel = Math.floor(spaces / 2);
            addBullet(bulletMatch[2].trim(), indentLevel);
            continue;
        }

        const cleanSubheading = trimmed.replace(/:$/, '');
        const isStandaloneSubheading =
            cleanSubheading.length <= 48 &&
            !/[.!?]$/.test(cleanSubheading) &&
            !/\b(increased|reduced|decreased|added|removed|fixed|updated)\b/i.test(cleanSubheading);

        if (isStandaloneSubheading) {
            flushList();
            htmlParts.push(
                `<h4 class="text-[15px] font-bold text-slate-100 pt-3 pb-0.5">${escapeHtml(cleanSubheading)}</h4>`
            );
            continue;
        }

        flushList();
        htmlParts.push(
            `<p class="text-[14px] text-slate-300 leading-relaxed">${formatBlizzLine(trimmed)}</p>`
        );
    }

    flushList();
    return htmlParts.join('\n');
}


// ==========================================
// 3. URL & DEEP-LINK HELPERS
// ==========================================

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


// ==========================================
// 4. HOME PAGE PREVIEWS & DIRECT JUMP
// ==========================================

function buildPatchTldr(patch, rawNotesOverride = '') {
    if (!patch) return 'No patch notes available yet.';
    const raw = String(rawNotesOverride || patch.inlineNotes || '').replace(/\r\n/g, '\n');
    const lines = raw
        .split('\n')
        .map(l => l.trim().replace(/^={2,}\s*|\s*={2,}$/g, '').replace(/^(?:•|[-*])\s+/, ''))
        .filter(l => l && !/^quick navigation:?$/i.test(l) && !/^return to top$/i.test(l));

    if (lines.length >= 2) {
        return `${lines[0]} — ${lines[1]}`.slice(0, 150);
    }
    if (lines.length === 1) {
        return lines[0].slice(0, 150);
    }
    return patch.patchVersion
        ? `Build ${patch.build || patch.patchVersion} patch notes and balance updates.`
        : 'Open patch notes for full details.';
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


// ==========================================
// 5. FEED, SIDEBAR & ENTRY POINT
// ==========================================

function getFilterButtons() {
    return Array.from(document.querySelectorAll('[data-patch-filter]'));
}

function syncFilterButtonStates() {
    const buttons = getFilterButtons();
    buttons.forEach(btn => {
        const type = String(btn.getAttribute('data-patch-filter') || '').toLowerCase();
        const isActive = type === CURRENT_FILTER;

        btn.setAttribute('aria-pressed', String(isActive));
        btn.classList.remove('bg-slate-950', ...ACTIVE_FILTER_CLASSES, ...INACTIVE_FILTER_CLASSES);
        btn.classList.add(...(isActive ? ACTIVE_FILTER_CLASSES : INACTIVE_FILTER_CLASSES));
    });
}

function setPatchFilter(filterType) {
    const normalized = ['all', 'live', 'ptr'].includes(String(filterType).toLowerCase())
        ? String(filterType).toLowerCase()
        : 'all';

    CURRENT_FILTER = normalized;
    syncFilterButtonStates();
    loadLivePatchNotes();
}

function initPatchFilterControls() {
    const buttons = getFilterButtons();
    buttons.forEach(btn => {
        if (btn.dataset.patchFilterBound === 'true') return;
        btn.dataset.patchFilterBound = 'true';
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-patch-filter');
            setPatchFilter(type);
        });
    });
    syncFilterButtonStates();
}

window.switchPatchFilter = setPatchFilter;

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

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    syncFilterButtonStates();

    const headerTitle = CURRENT_FILTER === 'all'
        ? 'ALL FEED'
        : `${CURRENT_FILTER.toUpperCase()} FEED`;

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(headerTitle)}</h3>
            <span class="text-[11px] font-mono text-slate-500">${items.length}</span>
        </div>
    `;

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-${CSS.escape(item.id)}`;
        btn.className = 'w-full text-left p-3.5 rounded-xl border border-slate-800/90 bg-slate-950/50 hover:bg-slate-800/70 hover:border-slate-700 transition space-y-2 group';
        btn.addEventListener('click', () => selectPatchItem(item.id));

        const feedBadge = item.feedType === 'ptr'
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30">PTR</span>`
            : `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30">LIVE</span>`;

        const eraPill = (item.era === 'alpha' || item.era === 'beta')
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-purple-300 bg-purple-500/15 border border-purple-500/30 uppercase">${escapeHtml(item.era)}</span>`
            : '';

        const versionPill = item.patchVersion
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-300 bg-slate-900 border border-slate-700/80">${escapeHtml(item.patchVersion)}</span>`
            : '';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-slate-400">${escapeHtml(item.listDate || item.date)}</span>
                <div class="flex items-center gap-1 shrink-0">
                    ${eraPill}
                    ${versionPill}
                    ${feedBadge}
                </div>
            </div>
            <h4 class="text-sm font-bold text-slate-100 group-hover:text-white leading-snug">${escapeHtml(item.title)}</h4>
        `;
        listContainer.appendChild(btn);
    });

    schedulePatchSidebarSync();
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

function resetPatchSidebarLayout() {
    const col = document.getElementById('patch-sidebar-column');
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (col) {
        col.style.minHeight = '';
    }
    if (box) {
        box.style.position = '';
        box.style.top = '';
        box.style.left = '';
        box.style.width = '';
        box.style.height = '';
        box.style.maxHeight = '';
    }
}

function syncPatchSidebarBurger() {
    patchSidebarRafId = null;

    const view = document.getElementById('view-patchnotes');
    const col = document.getElementById('patch-sidebar-column');
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (!view || !col || !box) return;

    const isVisible = !view.classList.contains('hidden') && view.offsetParent !== null;
    const isDesktop = window.innerWidth >= 1024;

    if (!isVisible || !isDesktop) {
        resetPatchSidebarLayout();
        return;
    }

    const header = document.querySelector('header');
    const footer = document.querySelector('body > footer');
    const TOP_GAP = 20;
    const BOTTOM_FOOTER_GAP = TOP_GAP;

    const headerBottom = header
        ? Math.round(header.getBoundingClientRect().bottom) + TOP_GAP
        : 76 + TOP_GAP;

    const footerTop = footer
        ? Math.round(footer.getBoundingClientRect().top)
        : window.innerHeight;

    const colRect = col.getBoundingClientRect();
    const naturalTop = Math.round(colRect.top);
    const naturalLeft = Math.round(colRect.left);
    const naturalWidth = Math.round(colRect.width);

    const lockedTop = Math.max(naturalTop, headerBottom);

    const defaultBottom = window.innerHeight - TOP_GAP;
    const footerClampedBottom = footerTop - BOTTOM_FOOTER_GAP;
    const bottomEdge = footerTop < window.innerHeight
        ? Math.min(defaultBottom, footerClampedBottom)
        : defaultBottom;

    const nextHeight = Math.max(180, bottomEdge - lockedTop);

    box.style.position = 'fixed';
    box.style.top = `${lockedTop}px`;
    box.style.left = `${naturalLeft}px`;
    box.style.width = `${naturalWidth}px`;
    box.style.height = `${nextHeight}px`;
    box.style.maxHeight = `${nextHeight}px`;
}

function schedulePatchSidebarSync() {
    if (patchSidebarRafId !== null) return;
    patchSidebarRafId = window.requestAnimationFrame(syncPatchSidebarBurger);
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
