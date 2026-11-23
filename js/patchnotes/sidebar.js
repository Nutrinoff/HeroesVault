// ===========================================
// 3. PATCH FILTER CONTROLS, SIDEBAR & STICKY LAYOUT
// ===========================================

let patchSidebarRafId = null;

const LEGACY_FILTER_CLASSES = [
    'bg-sky-500',
    'text-slate-950',
    'border-sky-400',
    'shadow-sm',
    'bg-slate-900/90',
    'text-slate-300',
    'border-slate-700/80',
    'hover:bg-slate-800',
    'hover:text-white',
    'bg-slate-950',
    'bg-cyan-400',
    'border-cyan-200',
    'bg-[#090417]',
    'text-violet-200',
    'border-[#3d2185]',
    'hover:bg-[#1c0e40]'
];

const UNBOXED_LIST_CLASSES = [
    'hots-subpanel',
    'bg-[#0c0621]',
    'bg-[#0c0621]/90',
    'bg-[#0c0621]/70',
    'border',
    'border-[#2b1a61]',
    'border-[#38247a]',
    'rounded-[2px]',
    'rounded-xl',
    'p-2',
    'p-3'
];

function getCurrentPatchFilter() {
    if (typeof patchState !== 'undefined' && patchState?.filter) {
        return patchState.filter;
    }
    return typeof CURRENT_FILTER === 'string' ? CURRENT_FILTER : 'all';
}

function getFilterButtons() {
    return Array.from(document.querySelectorAll('[data-patch-filter]'));
}

function syncFilterButtonStates() {
    const activeFilter = getCurrentPatchFilter();
    const buttons = getFilterButtons();

    buttons.forEach(btn => {
        const type = String(btn.getAttribute('data-patch-filter') || '').toLowerCase();
        const isActive = type === activeFilter;

        btn.setAttribute('aria-pressed', String(isActive));
        btn.classList.toggle('is-active', isActive);
        btn.classList.remove(...LEGACY_FILTER_CLASSES);
    });
}

function clearPatchDeepLinkFromLocation() {
    if (typeof patchState !== 'undefined' && patchState) {
        patchState.pendingDeepLink = null;
        patchState.selectedId = null;
    }

    try {
        const url = new URL(window.location.href);
        let changed = false;

        ['patch', 'patchId', 'id'].forEach(key => {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        });

        if (url.hash && url.hash.startsWith('#patchnotes')) {
            const qIndex = url.hash.indexOf('?');
            if (qIndex !== -1) {
                const hashParams = new URLSearchParams(url.hash.slice(qIndex + 1));
                ['patch', 'patchId', 'id'].forEach(key => {
                    if (hashParams.has(key)) {
                        hashParams.delete(key);
                        changed = true;
                    }
                });
                const nextQuery = hashParams.toString();
                url.hash = nextQuery ? `#patchnotes?${nextQuery}` : '#patchnotes';
                changed = true;
            }
        }

        if (changed && typeof window.history?.replaceState === 'function') {
            window.history.replaceState(null, '', url.toString());
        }
    } catch (_) {
        // Ignore URL manipulation errors in restricted contexts
    }
}

function setPatchFilter(filterType) {
    const raw = String(filterType || '').toLowerCase();
    const normalized = ['all', 'live', 'ptr'].includes(raw) ? raw : 'all';

    if (typeof patchState !== 'undefined' && patchState) {
        patchState.manualFilterLock = true;
    }

    clearPatchDeepLinkFromLocation();

    if (typeof patchState !== 'undefined' && patchState) {
        patchState.filter = normalized;
    }
    if (typeof CURRENT_FILTER !== 'undefined') {
        CURRENT_FILTER = normalized;
    }
    if (typeof setPatchFilterState === 'function') {
        setPatchFilterState(normalized);
    }

    syncFilterButtonStates();

    if (typeof loadLivePatchNotes === 'function') {
        loadLivePatchNotes();
    }
}

function initPatchFilterControls() {
    const buttons = getFilterButtons();
    buttons.forEach(btn => {
        if (btn.dataset.patchFilterBound === 'true') return;
        btn.dataset.patchFilterBound = 'true';
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-patch-filter');
            setPatchFilter(type);
            btn.blur();
        });
    });
    syncFilterButtonStates();
}

window.switchPatchFilter = setPatchFilter;

function syncSidebarActiveCardState(selectedId) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    const targetId = selectedId != null ? String(selectedId) : null;
    const buttons = listContainer.querySelectorAll('button[data-patch-id]');

    buttons.forEach(btn => {
        const isSelected = targetId !== null && btn.dataset.patchId === targetId;
        btn.classList.add('hots-list-item');
        btn.classList.toggle('is-selected', isSelected);
        if (isSelected) {
            btn.setAttribute('aria-current', 'true');
        } else {
            btn.removeAttribute('aria-current');
        }
    });
}

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    listContainer.classList.remove(...UNBOXED_LIST_CLASSES);
    syncFilterButtonStates();

    const safeItems = Array.isArray(items) ? items : [];
    const activeId = typeof patchState !== 'undefined' ? patchState.selectedId : null;
    const frag = document.createDocumentFragment();

    safeItems.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-patch-${idx}`;
        btn.dataset.patchId = String(item.id);
        const isSelected = activeId !== null && String(activeId) === String(item.id);
        btn.className = `hots-list-item${isSelected ? ' is-selected' : ''}`;
        if (isSelected) {
            btn.setAttribute('aria-current', 'true');
        }
        btn.addEventListener('click', event => {
            selectPatchItem(item.id);
            if (event.detail > 0) {
                btn.blur();
            }
        });

        const feedBadge = item.feedType === 'ptr'
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-[#ffeab6] bg-[#e38b0d]/20 border border-[#fed600]/40">PTR</span>`
            : `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-[#cbe8ff] bg-[#0063c8]/25 border border-[#58baff]/40">LIVE</span>`;

        const eraPill = (item.era === 'alpha' || item.era === 'beta')
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-[#9d90ff] bg-[#1d1247] border border-[#5c42b8] uppercase">${escapeHtml(item.era)}</span>`
            : '';

        const versionPill = item.patchVersion
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono text-[#9cb6ff] bg-[#0c0621] border border-[#38247a]">${escapeHtml(item.patchVersion)}</span>`
            : '';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="hots-list-item__meta">${escapeHtml(item.listDate || item.date)}</span>
                <div class="flex items-center gap-1 shrink-0">
                    ${eraPill}
                    ${versionPill}
                    ${feedBadge}
                </div>
            </div>
            <h4 class="hots-list-item__title text-sm font-bold leading-snug mt-1.5">${escapeHtml(item.title)}</h4>
        `;
        frag.appendChild(btn);
    });

    listContainer.replaceChildren(frag);
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
