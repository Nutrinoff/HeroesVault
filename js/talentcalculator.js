// ==========================================
// 1. BUILDER STATE & NAVIGATION
// ==========================================

const ACTIVE_TALENT_CLASSES = ['border-amber-400', 'shadow-lg', 'scale-105'];
const INACTIVE_TALENT_CLASSES = ['border-slate-700', 'hover:border-slate-400', 'opacity-75', 'hover:opacity-100'];

function syncBuilderUrl(push = false) {
    if (!builderHeroId) return;
    const buildStr = encodeTalentSelections(builderSelectedTalents);
    const url = `#builder?hero=${encodeURIComponent(builderHeroId)}&build=${buildStr}`;
    const state = {
        tab: 'builder',
        params: { hero: builderHeroId, build: buildStr }
    };

    if (push) {
        history.pushState(state, '', url);
    } else {
        history.replaceState(state, '', url);
    }
}

async function openBuilder(id = null, selections = null, update = true) {
    id = id || MASTER_HERO_LIST[0]?.id;
    if (!id) return;

    resetBuilderState(id, selections);
    switchTabUI('builder');

    if (typeof filterHeroes === 'function') {
        filterHeroes();
    } else if (typeof renderHeroSidebar === 'function') {
        renderHeroSidebar(MASTER_HERO_LIST);
    }

    const heroData = getNormalizedHeroData(id);
    if (!heroData) {
        console.error('Missing normalized hero data for builder:', id);
        return;
    }

    builderHeroData = heroData;
    renderBuilderHeader(builderHeroData);
    renderBuilderMatrix();
    updateBuilderOutput(false);

    if (update) {
        syncBuilderUrl(true);
    }
}


// ==========================================
// 2. MATRIX & BUILD CODE OUTPUT
// ==========================================

function updateBuilderMatrixSelection() {
    const box = document.getElementById('builder-matrix');
    if (!box) return;

    box.querySelectorAll('button[data-tier-idx]').forEach(btn => {
        const tierIdx = Number(btn.dataset.tierIdx);
        const choiceNum = Number(btn.dataset.choiceNum);
        const isSelected = builderSelectedTalents[tierIdx] === choiceNum;

        btn.classList.remove(...ACTIVE_TALENT_CLASSES, ...INACTIVE_TALENT_CLASSES);
        btn.classList.add(...(isSelected ? ACTIVE_TALENT_CLASSES : INACTIVE_TALENT_CLASSES));
    });
}

function renderBuilderMatrix() {
    const box = document.getElementById('builder-matrix');
    if (!box) return;

    if (!builderHeroData) {
        box.innerHTML = '';
        return;
    }

    const frag = document.createDocumentFragment();

    TALENT_TIERS.forEach((l, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3';
        row.innerHTML = `<div class="w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-b from-purple-600 to-indigo-900 border-2 border-purple-400/80 font-black">${l}</div>`;

        const choices = document.createElement('div');
        choices.className = 'flex flex-wrap gap-2.5 items-center';

        (builderHeroData.talents[l] || []).forEach((t, i) => {
            const n = i + 1;
            const b = document.createElement('button');
            const isSelected = builderSelectedTalents[idx] === n;

            b.type = 'button';
            b.dataset.tierIdx = String(idx);
            b.dataset.choiceNum = String(n);
            b.className = `w-12 h-12 rounded-xl border-2 overflow-hidden bg-slate-950 transition-all ${
                (isSelected ? ACTIVE_TALENT_CLASSES : INACTIVE_TALENT_CLASSES).join(' ')
            }`;

            b.addEventListener('click', () => {
                builderSelectedTalents[idx] = n;
                updateBuilderMatrixSelection();
                updateBuilderOutput(true);
            });

            b.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            b.addEventListener('mouseleave', hideTooltip);
            b.innerHTML = `<img src="${getAssetUrl(t.icon)}" onerror="this.src='https://via.placeholder.com/48?text=?'" class="w-full h-full object-cover">`;

            choices.appendChild(b);
        });

        row.appendChild(choices);
        frag.appendChild(row);
    });

    box.replaceChildren(frag);
}

function resetBuilder() {
    resetBuilderState(builderHeroId, null);
    updateBuilderMatrixSelection();
    updateBuilderOutput(true);
}

function updateBuilderOutput(updateUrl = true) {
    const codeEl = document.getElementById('builder-string-code');
    if (codeEl) {
        codeEl.innerText = encodeBuildCode(builderSelectedTalents, builderHeroId);
    }
    if (updateUrl) {
        syncBuilderUrl(false);
    }
}

function getIngameBuildString() {
    const heroLabel = builderHeroData?.name || builderHeroId || '';
    return encodeBuildCode(builderSelectedTalents, heroLabel);
}

function flashCopyButtonState(btn, copiedText) {
    if (!btn) return;
    if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
    }

    clearTimeout(btn._copyResetTimer);
    btn.textContent = copiedText;
    btn.classList.add('ring-2', 'ring-cyan-300/70');

    btn._copyResetTimer = setTimeout(() => {
        btn.innerHTML = btn.dataset.originalHtml;
        btn.classList.remove('ring-2', 'ring-cyan-300/70');
    }, 1600);
}

function copyTextWithFallback(text, label, buttonEl = null, copiedLabel = 'Copied') {
    if (!text) return;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
            .then(() => flashCopyButtonState(buttonEl, copiedLabel))
            .catch(() => prompt(`Copy ${label}:`, text));
    } else {
        prompt(`Copy ${label}:`, text);
    }
}

function copyBuilderUrl(buttonEl = null) {
    syncBuilderUrl(false);
    copyTextWithFallback(window.location.href, 'build URL', buttonEl, 'Copied URL');
}

function copyIngameBuildCode(buttonEl = null) {
    copyTextWithFallback(getIngameBuildString(), 'ingame build code', buttonEl, 'Copied Ingame');
}

function copyBuilderString(buttonEl = null) {
    copyBuilderUrl(buttonEl);
}
