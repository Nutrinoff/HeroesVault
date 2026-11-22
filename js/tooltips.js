// js/tooltips.js
// ==========================================
// 1. TOOLTIP POSITIONING & DISPLAY
// ==========================================

const TOOLTIP_CURSOR_GAP = 16;
const TOOLTIP_VIEWPORT_MARGIN = 8;
const TOOLTIP_ICON_FALLBACK = 'https://via.placeholder.com/44?text=?';

function positionTooltip(clientX, clientY) {
    const tip = document.getElementById('talent-tooltip');
    if (!tip || tip.classList.contains('hidden')) return;

    const { width, height } = tip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let left = clientX + TOOLTIP_CURSOR_GAP;
    if (left + width > viewportWidth - TOOLTIP_VIEWPORT_MARGIN) {
        left = clientX - width - TOOLTIP_CURSOR_GAP;
    }
    left = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(left, viewportWidth - width - TOOLTIP_VIEWPORT_MARGIN));

    let top = clientY + TOOLTIP_CURSOR_GAP;
    if (top + height > viewportHeight - TOOLTIP_VIEWPORT_MARGIN) {
        top = clientY - height - TOOLTIP_VIEWPORT_MARGIN;
    }
    top = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(top, viewportHeight - height - TOOLTIP_VIEWPORT_MARGIN));

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

function showAbilityTooltip(e, a) {
    showTooltip(e, a.name, `Ability [${a.key}]${a.variant ? ' · ' + a.variant : ''}`, a.desc, a.icon);
}

function showTalentTooltip(e, t, l) {
    showTooltip(e, t.name, `Level ${l} Talent`, t.fullText || t.shortText || t.description || '', t.icon);
}

function showTooltip(e, name, level, description, icon) {
    const tip = document.getElementById('talent-tooltip');
    if (!tip) return;

    const tipIcon = document.getElementById('tip-icon');
    const tipName = document.getElementById('tip-name');
    const tipLevel = document.getElementById('tip-level');
    const tipDesc = document.getElementById('tip-desc');

    if (tipIcon) {
        const fallback = typeof HERO_VIEW_ICON_FALLBACK === 'string'
            ? HERO_VIEW_ICON_FALLBACK
            : TOOLTIP_ICON_FALLBACK;
        const resolvedIcon = typeof resolveAssetUrl === 'function'
            ? resolveAssetUrl(icon, fallback)
            : (icon || fallback);

        tipIcon.onerror = () => {
            tipIcon.onerror = null;
            if (tipIcon.src !== fallback) {
                tipIcon.src = fallback;
            }
        };
        tipIcon.src = resolvedIcon;
    }

    if (tipName) tipName.innerText = name || '';
    if (tipLevel) tipLevel.innerText = level;
    if (tipDesc) tipDesc.innerHTML = typeof formatGameText === 'function'
        ? (formatGameText(description) || 'No description available.')
        : (description || 'No description available.');

    tip.classList.remove('hidden');
    positionTooltip(e.clientX, e.clientY);
}

function hideTooltip() {
    document.getElementById('talent-tooltip')?.classList.add('hidden');
}

function initializeTooltips() {
    document.addEventListener('pointermove', e => positionTooltip(e.clientX, e.clientY), { passive: true });
}
