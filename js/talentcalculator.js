// ==========================================
// 1. BUILDER STATE & NAVIGATION
// ==========================================

const ACTIVE_TALENT_CLASSES = ['border-amber-400', 'shadow-lg', 'scale-105'];
const INACTIVE_TALENT_CLASSES = ['border-slate-700', 'hover:border-slate-400', 'opacity-75', 'hover:opacity-100'];
const TALENT_ICON_FALLBACK = 'https://via.placeholder.com/48?text=?';

function getBuilderSelectedTalentObjects() {
    if (!builderHeroData?.talents || !Array.isArray(builderSelectedTalents)) return [];
    const tiers = typeof TALENT_TIERS !== 'undefined' ? TALENT_TIERS : ['1', '4', '7', '10', '13', '16', '20'];

    return tiers.map((tier, idx) => {
        const tierList = builderHeroData.talents?.[tier] || builderHeroData.talents?.[`Level${tier}`] || [];
        const choiceNum = Number(builderSelectedTalents[idx]);
        if (!choiceNum || choiceNum < 1) return null;
        return tierList[choiceNum - 1] || null;
    }).filter(Boolean);
}

function syncBuilderAbilityStrip() {
    if (!builderHeroData || typeof renderBuilderHeader !== 'function') return;
    renderBuilderHeader(builderHeroData, getBuilderSelectedTalentObjects());
}

function buildBuilderHashAndState(heroId, selections) {
    const buildStr = typeof encodeTalentSelections === 'function'
        ? encodeTalentSelections(selections)
        : normalizeTalentSelections(selections).join('');
    const hashUrl = `#builder?hero=${encodeURIComponent(heroId)}&build=${encodeURIComponent(buildStr)}`;
    const state = {
        tab: 'builder',
        params: { hero: heroId, build: buildStr }
    };
    return { buildStr, hashUrl, state };
}

function syncBuilderUrl(push = false) {
    if (!builderHeroId) return;
    const { hashUrl, state } = buildBuilderHashAndState(builderHeroId, builderSelectedTalents);

    if (push) {
        history.pushState(state, '', hashUrl);
    } else {
        history.replaceState(state, '', hashUrl);
    }
}

async function openBuilder(id = null, selections = null, update = true) {
    bindTalentBuilderEvents();

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
    syncBuilderAbilityStrip();
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

function resolveBuilderTalentIcon(iconPath) {
    if (typeof resolveAssetUrl === 'function') {
        return resolveAssetUrl(iconPath, TALENT_ICON_FALLBACK);
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(iconPath, TALENT_ICON_FALLBACK);
    }
    return TALENT_ICON_FALLBACK;
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
                syncBuilderAbilityStrip();
                updateBuilderOutput(true);
            });

            b.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            b.addEventListener('mouseleave', hideTooltip);

            const img = document.createElement('img');
            img.className = 'w-full h-full object-cover';
            img.alt = t.name || `Level ${l} talent`;
            img.addEventListener('error', () => {
                if (img.src !== TALENT_ICON_FALLBACK) {
                    img.src = TALENT_ICON_FALLBACK;
                }
            });
            img.src = resolveBuilderTalentIcon(t.icon);

            b.appendChild(img);
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
    syncBuilderAbilityStrip();
    updateBuilderOutput(true);
}

function getBuilderDisplayCode() {
    if (typeof encodeBuildCode === 'function') {
        return encodeBuildCode(builderSelectedTalents, builderHeroId);
    }
    return `[T${normalizeTalentSelections(builderSelectedTalents).join('')},${builderHeroId || ''}]`;
}

function updateBuilderOutput(updateUrl = true) {
    const codeEl = document.getElementById('builder-string-code');
    if (codeEl) {
        codeEl.innerText = getBuilderDisplayCode();
    }
    if (updateUrl) {
        syncBuilderUrl(false);
    }
}

function getIngameBuildString() {
    const heroLabel = builderHeroData?.name || builderHeroId || '';
    if (typeof encodeIngameBuildCode === 'function') {
        return encodeIngameBuildCode(builderSelectedTalents, heroLabel);
    }
    return encodeBuildCode(builderSelectedTalents, heroLabel);
}

function getShareableBuilderUrl() {
    if (!builderHeroId) return window.location.href;
    const { buildStr } = buildBuilderHashAndState(builderHeroId, builderSelectedTalents);
    if (typeof buildBuilderShareUrl === 'function') {
        const base = `${window.location.origin}${window.location.pathname}`;
        return `${base}?view=builder&hero=${encodeURIComponent(builderHeroId)}&build=${encodeURIComponent(buildStr)}`;
    }
    return `${window.location.origin}${window.location.pathname}#builder?hero=${encodeURIComponent(builderHeroId)}&build=${encodeURIComponent(buildStr)}`;
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
    copyTextWithFallback(getShareableBuilderUrl(), 'build URL', buttonEl, 'Copied URL');
}

function copyIngameBuildCode(buttonEl = null) {
    copyTextWithFallback(getIngameBuildString(), 'ingame build code', buttonEl, 'Copied Ingame');
}

function copyBuilderString(buttonEl = null) {
    copyBuilderUrl(buttonEl);
}

function bindTalentBuilderEvents() {
    const resetBtn = document.getElementById('builder-reset-btn');
    if (resetBtn && resetBtn.dataset.builderBound !== 'true') {
        resetBtn.dataset.builderBound = 'true';
        resetBtn.addEventListener('click', resetBuilder);
    }

    const copyUrlBtn = document.getElementById('builder-copy-url-btn');
    if (copyUrlBtn && copyUrlBtn.dataset.builderBound !== 'true') {
        copyUrlBtn.dataset.builderBound = 'true';
        copyUrlBtn.addEventListener('click', () => copyBuilderUrl(copyUrlBtn));
    }

    const copyIngameBtn = document.getElementById('builder-copy-ingame-btn');
    if (copyIngameBtn && copyIngameBtn.dataset.builderBound !== 'true') {
        copyIngameBtn.dataset.builderBound = 'true';
        copyIngameBtn.addEventListener('click', () => copyIngameBuildCode(copyIngameBtn));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTalentBuilderEvents, { once: true });
} else {
    bindTalentBuilderEvents();
}
