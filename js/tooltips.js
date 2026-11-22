// js/tooltips.js
// ==========================================
// 1. TOOLTIP POSITIONING & DISPLAY
// ==========================================

const TOOLTIP_CURSOR_GAP = 16;
const TOOLTIP_VIEWPORT_MARGIN = 8;
const TOOLTIP_ICON_FALLBACK = 'https://via.placeholder.com/48?text=?';

function cleanTooltipInlineText(raw) {
    if (raw == null) return '';
    return String(raw)
        .replace(/<n\s*\/?>/gi, ' ')
        .replace(/<c\b[^>]*>~~(.*?)~~<\/c>/gi, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/<\/?[sc]\b[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

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
    left = Math.max(
        TOOLTIP_VIEWPORT_MARGIN,
        Math.min(left, Math.max(TOOLTIP_VIEWPORT_MARGIN, viewportWidth - width - TOOLTIP_VIEWPORT_MARGIN))
    );

    let top = clientY + TOOLTIP_CURSOR_GAP;
    if (top + height > viewportHeight - TOOLTIP_VIEWPORT_MARGIN) {
        top = clientY - height - TOOLTIP_CURSOR_GAP;
    }
    top = Math.max(
        TOOLTIP_VIEWPORT_MARGIN,
        Math.min(top, Math.max(TOOLTIP_VIEWPORT_MARGIN, viewportHeight - height - TOOLTIP_VIEWPORT_MARGIN))
    );

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

function formatTooltipDetailsLine(item) {
    if (!item || typeof item !== 'object') return '';
    const parts = [];

    const rawCooldown = item.cooldownText ?? item.cooldown;
    const cleanCooldown = cleanTooltipInlineText(rawCooldown);
    if (cleanCooldown) {
        const hasPrefix = /^(cooldown|charge cooldown|recharge)\b/i.test(cleanCooldown);
        parts.push(hasPrefix ? cleanCooldown : `Cooldown: ${cleanCooldown}`);
    }

    const rawEnergy = item.energyText ?? item.mana ?? item.cost;
    const cleanEnergy = cleanTooltipInlineText(rawEnergy);
    if (cleanEnergy) {
        const hasPrefix = /^(mana|energy|brew|fury|hope|cost)\b/i.test(cleanEnergy);
        if (hasPrefix) {
            parts.push(cleanEnergy);
        } else if (item.mana != null && String(item.mana).trim() !== '') {
            parts.push(`Mana: ${cleanEnergy}`);
        } else {
            parts.push(`Cost: ${cleanEnergy}`);
        }
    }

    if (item.charges && typeof item.charges === 'object') {
        const maxCharges = Number(item.charges.countMax);
        if (Number.isFinite(maxCharges) && maxCharges > 1 && !/charges?\b/i.test(parts.join(' '))) {
            parts.push(`${maxCharges} Charges`);
        }
    }

    return parts.join(' · ');
}

function showAbilityTooltip(e, a) {
    if (!a || typeof a !== 'object') return;
    const key = a.key || a.abilityType || '';
    const variant = a.variant || '';
    const meta = `Ability${key ? ` [${key}]` : ''}${variant ? ` · ${variant}` : ''}`;
    const desc = a.desc ?? a.fullText ?? a.shortText ?? '';
    showTooltip(e, a.name, meta, desc, a.icon, formatTooltipDetailsLine(a));
}

function showTalentTooltip(e, t, l) {
    if (!t || typeof t !== 'object') return;
    const levelLabel = l != null && String(l).trim() !== '' ? `Level ${l} Talent` : 'Talent';
    showTooltip(
        e,
        t.name,
        levelLabel,
        t.fullText || t.shortText || t.description || t.desc || '',
        t.icon,
        formatTooltipDetailsLine(t)
    );
}

function showTooltip(e, name, level, description, icon, details = '') {
    const tip = document.getElementById('talent-tooltip');
    if (!tip) return;

    const tipIcon = document.getElementById('tip-icon');
    const tipName = document.getElementById('tip-name');
    const tipLevel = document.getElementById('tip-level');
    const tipCooldown = document.getElementById('tip-cooldown');
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

    if (tipName) {
        tipName.innerText = name || '';
        tipName.classList.toggle('hidden', !name);
    }

    if (tipLevel) {
        tipLevel.innerText = level || '';
        tipLevel.classList.toggle('hidden', !level);
    }

    if (tipCooldown) {
        tipCooldown.innerText = details || '';
        tipCooldown.classList.toggle('hidden', !details);
    }

    if (tipDesc) {
        tipDesc.innerHTML = typeof formatGameText === 'function'
            ? (formatGameText(description) || 'No description available.')
            : (description || 'No description available.');
    }

    tip.classList.remove('hidden');
    if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        positionTooltip(e.clientX, e.clientY);
    }
}

function hideTooltip() {
    document.getElementById('talent-tooltip')?.classList.add('hidden');
}

function initializeTooltips() {
    document.addEventListener('pointermove', e => positionTooltip(e.clientX, e.clientY), { passive: true });
}
