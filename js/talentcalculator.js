// ==========================================
// 1. BUILDER STATE & NAVIGATION
// ==========================================

const ACTIVE_TALENT_CLASSES = [
    'border-[#58baff]',
    'ring-1',
    'ring-[#cbe8ff]/55',
    'shadow-[0_0_14px_rgba(0,156,255,0.42)]',
    'opacity-100'
];
const INACTIVE_TALENT_CLASSES = [
    'border-[#38247a]',
    'hover:border-[#5c42b8]',
    'opacity-70',
    'hover:opacity-100'
];
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
        btn.setAttribute('aria-pressed', String(isSelected));
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
        row.innerHTML = `
            <div class="hots-subpanel w-12 h-12 shrink-0 flex items-center justify-center rounded-[2px] border border-[#3d2882] font-mono text-sm font-bold text-[#9cb6ff] select-none">
                ${l}
            </div>
        `;

        const choices = document.createElement('div');
        choices.className = 'flex flex-wrap gap-2.5 items-center';

        (builderHeroData.talents[l] || []).forEach((t, i) => {
            const n = i + 1;
            const b = document.createElement('button');
            const isSelected = builderSelectedTalents[idx] === n;

            b.type = 'button';
            b.dataset.tierIdx = String(idx);
            b.dataset.choiceNum = String(n);
            b.setAttribute('aria-pressed', String(isSelected));
            b.className = `hots-talent-slot w-12 h-12 rounded-[2px] border overflow-hidden bg-[#070412] transition-[border-color,box-shadow,opacity] duration-150 cursor-pointer ${
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
    if (btn.dataset.originalLabel === undefined) {
        btn.dataset.originalLabel = btn.textContent.trim();
    }

    clearTimeout(btn._copyResetTimer);
    btn.textContent = copiedText;
    btn.classList.add('ring-2', 'ring-[#58baff]/75');

    btn._copyResetTimer = setTimeout(() => {
        btn.textContent = btn.dataset.originalLabel;
        btn.classList.remove('ring-2', 'ring-[#58baff]/75');
    }, 1600);
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
        copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch (_) {
        copied = false;
    }

    document.body.removeChild(textarea);

    if (savedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
    }

    return Boolean(copied);
}

function copyTextWithFallback(text, buttonEl = null, copiedLabel = 'Copied') {
    if (!text) return;

    const completeCopy = () => {
        flashCopyButtonState(buttonEl, copiedLabel);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
            .then(completeCopy)
            .catch(() => {
                if (fallbackCopyText(text)) {
                    completeCopy();
                }
            });
    } else if (fallbackCopyText(text)) {
        completeCopy();
    }
}

function copyBuilderUrl(buttonEl = null) {
    syncBuilderUrl(false);
    copyTextWithFallback(getShareableBuilderUrl(), buttonEl, 'Copied URL');
}

function copyIngameBuildCode(buttonEl = null) {
    copyTextWithFallback(getIngameBuildString(), buttonEl, 'Copied Ingame');
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
