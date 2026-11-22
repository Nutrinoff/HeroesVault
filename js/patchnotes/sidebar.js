// ==========================================
// 3. PATCH FILTER CONTROLS, SIDEBAR & STICKY LAYOUT
// ==========================================

let patchSidebarRafId = null;

const ACTIVE_FILTER_CLASSES = [
    'bg-sky-500',
    'text-slate-950',
    'border-sky-400',
    'shadow-sm'
];

const INACTIVE_FILTER_CLASSES = [
    'bg-slate-900/90',
    'text-slate-300',
    'border-slate-700/80',
    'hover:bg-slate-800',
    'hover:text-white'
];

const LEGACY_FILTER_CLASSES = [
    'bg-slate-950',
    'bg-cyan-400',
    'border-cyan-200',
    'bg-[#090417]',
    'text-violet-200',
    'border-[#3d2185]',
    'hover:bg-[#1c0e40]'
];

const SELECTED_CARD_CLASSES = ['bg-sky-500/15', 'border-sky-500/70'];
const UNSELECTED_CARD_CLASSES = ['border-slate-800/90', 'bg-slate-950/50', 'hover:bg-slate-800/70', 'hover:border-slate-700'];

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
        btn.classList.remove(
            ...LEGACY_FILTER_CLASSES,
            ...ACTIVE_FILTER_CLASSES,
            ...INACTIVE_FILTER_CLASSES
        );
        btn.classList.add(...(isActive ? ACTIVE_FILTER_CLASSES : INACTIVE_FILTER_CLASSES));
    });
}

function setPatchFilter(filterType) {
    const raw = String(filterType || '').toLowerCase();
    const normalized = ['all', 'live', 'ptr'].includes(raw) ? raw : 'all';

    if (typeof setPatchFilterState === 'function') {
        setPatchFilterState(normalized);
    } else {
        if (typeof CURRENT_FILTER !== 'undefined') {
            CURRENT_FILTER = normalized;
        }
        syncFilterButtonStates();
    }

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
        btn.setAttribute('aria-current', isSelected ? 'true' : 'false');
        btn.classList.remove(...SELECTED_CARD_CLASSES, ...UNSELECTED_CARD_CLASSES);
        btn.classList.add(...(isSelected ? SELECTED_CARD_CLASSES : UNSELECTED_CARD_CLASSES));
    });
}

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    syncFilterButtonStates();

    const activeFilter = getCurrentPatchFilter();
    const headerTitle = activeFilter === 'all'
        ? 'ALL FEED'
        : `${activeFilter.toUpperCase()} FEED`;

    const safeItems = Array.isArray(items) ? items : [];
    const activeId = typeof patchState !== 'undefined' ? patchState.selectedId : null;

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(headerTitle)}</h3>
            <span class="text-[11px] font-mono text-slate-500">${safeItems.length}</span>
        </div>
    `;

    const frag = document.createDocumentFragment();

    safeItems.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-patch-${idx}`;
        btn.dataset.patchId = String(item.id);
        const isSelected = activeId !== null && String(activeId) === String(item.id);
        btn.setAttribute('aria-current', isSelected ? 'true' : 'false');
        btn.className = `w-full text-left p-3.5 rounded-xl border transition space-y-2 group ${
            isSelected
                ? SELECTED_CARD_CLASSES.join(' ')
                : UNSELECTED_CARD_CLASSES.join(' ')
        }`;
        btn.addEventListener('click', event => {
            selectPatchItem(item.id);
            if (event.detail > 0) {
                btn.blur();
            }
        });

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
        frag.appendChild(btn);
    });

    listContainer.appendChild(frag);
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
