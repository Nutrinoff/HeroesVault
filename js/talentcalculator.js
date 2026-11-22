// ==========================================
// 1. BUILDER STATE & NAVIGATION
// ==========================================

const ACTIVE_TALENT_CLASSES = ['border-amber-400', 'shadow-lg', 'scale-105'];
const INACTIVE_TALENT_CLASSES = ['border-slate-700', 'hover:border-slate-400', 'opacity-75', 'hover:opacity-100'];

function getActiveTiers() {
    return typeof TALENT_TIERS !== 'undefined' && Array.isArray(TALENT_TIERS)
        ? TALENT_TIERS
        : ['1', '4', '7', '10', '13', '16', '20'];
}

function getNormalizedSelections(selections) {
    if (typeof normalizeTalentSelections === 'function') {
        return normalizeTalentSelections(selections);
    }
    return Array.isArray(selections) && selections.length === 7
        ? selections.map(x => Number(x) || 1)
        : [1, 1, 1, 1, 1, 1, 1];
}

function getEncodedSelections(selections = builderSelectedTalents) {
    if (typeof encodeTalentSelections === 'function') {
        return encodeTalentSelections(selections);
    }
    return getNormalizedSelections(selections).join('');
}

function getFormattedBuildCode(selections = builderSelectedTalents, heroId = builderHeroId) {
    if (typeof encodeBuildCode === 'function') {
        return encodeBuildCode(selections, heroId);
    }
    return `[T${getEncodedSelections(selections)},${heroId || ''}]`;
}

function syncBuilderUrl(push = false) {
    if (!builderHeroId) return;
    const buildStr = getEncodedSelections(builderSelectedTalents);
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

    builderHeroId = id;
    switchTabUI('builder');

    if (typeof filterHeroes === 'function') {
        filterHeroes();
    } else if (typeof renderHeroSidebar === 'function') {
        renderHeroSidebar(MASTER_HERO_LIST);
    }

    builderSelectedTalents = getNormalizedSelections(selections);

    const heroData = typeof getNormalizedHeroData === 'function'
        ? getNormalizedHeroData(id)
        : null;

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

    const tiers = getActiveTiers();
    const frag = document.createDocumentFragment();

    tiers.forEach((l, idx) => {
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
    builderSelectedTalents = getNormalizedSelections(null);
    updateBuilderMatrixSelection();
    updateBuilderOutput(true);
}

function updateBuilderOutput(updateUrl = true) {
    const codeEl = document.getElementById('builder-string-code');
    if (codeEl) {
        codeEl.innerText = getFormattedBuildCode(builderSelectedTalents, builderHeroId);
    }
    if (updateUrl) {
        syncBuilderUrl(false);
    }
}

function copyBuilderString() {
    const u = location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(u).then(() => alert(`Copied build link:\n${u}`));
    } else {
        prompt('Copy build link:', u);
    }
}
