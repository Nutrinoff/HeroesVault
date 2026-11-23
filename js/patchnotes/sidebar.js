// ===========================================
// 3. PATCH FILTER CONTROLS, SIDEBAR & STICKY LAYOUT
// ===========================================

let patchSidebarRafId = null;

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
    });
}

function clearPatchDeepLinkFromLocation() {
    if (typeof patchState !== 'undefined' && patchState) {
        patchState.pendingSelectionId = null;
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

    clearPatchDeepLinkFromLocation();

    if (typeof setPatchFilterState === 'function') {
        setPatchFilterState(normalized);
    } else {
        if (typeof patchState !== 'undefined' && patchState) {
            patchState.filter = normalized;
        }
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

        const feedLabel = item.feedType === 'ptr'
            ? `<span class="hots-list-tag hots-list-tag--gold">PTR</span>`
            : `<span class="hots-list-tag hots-list-tag--cyan">LIVE</span>`;

        const eraLabel = (item.era === 'alpha' || item.era === 'beta')
            ? `<span class="hots-list-tag hots-list-tag--meta">${escapeHtml(item.era)}</span>`
            : '';

        const versionLabel = item.patchVersion
            ? `<span class="hots-list-tag hots-list-tag--meta">${escapeHtml(item.patchVersion)}</span>`
            : '';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="hots-list-item__meta">${escapeHtml(item.listDate || item.date)}</span>
                <div class="flex items-center gap-2 shrink-0">
                    ${eraLabel}
                    ${versionLabel}
                    ${feedLabel}
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
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (box) {
        box.style.position = '';
        box.style.top = '';
        box.style.maxHeight = '';
    }
}

function syncPatchSidebarBurger() {
    patchSidebarRafId = null;

    const view = document.getElementById('view-patchnotes');
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (!view || !box) return;

    const isVisible = !view.classList.contains('hidden') && view.offsetParent !== null;
    const isDesktop = window.innerWidth >= 1024;

    if (!isVisible || !isDesktop) {
        resetPatchSidebarLayout();
        return;
    }

    const header = document.querySelector('header');
    const footer = document.querySelector('body > footer');
    const gap = 20;

    const topOffset = header
        ? Math.max(gap, Math.round(header.getBoundingClientRect().bottom) + gap)
        : 96;

    const footerTop = footer
        ? Math.round(footer.getBoundingClientRect().top)
        : window.innerHeight;

    const bottomLimit = footerTop < window.innerHeight
        ? Math.max(topOffset + 180, footerTop - gap)
        : window.innerHeight - gap;

    box.style.position = 'sticky';
    box.style.top = `${topOffset}px`;
    box.style.maxHeight = `${Math.max(180, bottomLimit - topOffset)}px`;
}

function schedulePatchSidebarSync() {
    if (patchSidebarRafId !== null) return;
    patchSidebarRafId = window.requestAnimationFrame(syncPatchSidebarBurger);
}
