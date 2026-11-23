// js/tooltips.js
// ==========================================
// 1. TOOLTIP POSITIONING & DISPLAY
// ==========================================

const TOOLTIP_CURSOR_GAP = 16;
const TOOLTIP_VIEWPORT_MARGIN = 8;
const TOOLTIP_ICON_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#0d0724"/><rect x="1" y="1" width="46" height="46" fill="none" stroke="#38247a" stroke-width="2"/><text x="24" y="30" fill="#9cb6ff" font-family="monospace" font-size="18" text-anchor="middle">?</text></svg>')}`;

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

function getTooltipDetailLines(item) {
    if (!item || typeof item !== 'object') return [];
    const lines = [];

    const rawEnergy = item.energyText ?? item.mana ?? item.cost;
    const cleanEnergy = cleanTooltipInlineText(rawEnergy);
    if (cleanEnergy) {
        const hasPrefix = /^(mana|energy|brew|fury|hope|cost)\b/i.test(cleanEnergy);
        if (hasPrefix) {
            lines.push(cleanEnergy);
        } else if (item.mana != null && String(item.mana).trim() !== '') {
            lines.push(`Mana: ${cleanEnergy}`);
        } else {
            lines.push(`Cost: ${cleanEnergy}`);
        }
    }

    const rawCooldown = item.cooldownText ?? item.cooldown;
    const cleanCooldown = cleanTooltipInlineText(rawCooldown);
    if (cleanCooldown) {
        const hasPrefix = /^(cooldown|charge cooldown|recharge)\b/i.test(cleanCooldown);
        lines.push(hasPrefix ? cleanCooldown : `Cooldown: ${cleanCooldown}`);
    }

    if (item.charges && typeof item.charges === 'object') {
        const maxCharges = Number(item.charges.countMax);
        const combinedText = lines.join(' ');
        if (Number.isFinite(maxCharges) && maxCharges > 1 && !/charges?\b/i.test(combinedText)) {
            lines.push(`Charges: ${maxCharges}`);
        }
    }

    return lines;
}

function showAbilityTooltip(e, a) {
    if (!a || typeof a !== 'object') return;
    const key = a.key || a.abilityType || '';
    const variant = a.variant || '';
    const meta = `Ability${key ? ` [${key}]` : ''}${variant ? ` · ${variant}` : ''}`;
    const desc = a.desc ?? a.fullText ?? a.shortText ?? '';
    showTooltip(e, a.name, meta, desc, a.icon, getTooltipDetailLines(a));
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
        getTooltipDetailLines(t)
    );
}

function applyTooltipIconFallback(imgEl, fallbackUrl) {
    if (!imgEl || !fallbackUrl) return;
    if (typeof attachImageFallback === 'function') {
        attachImageFallback(imgEl, fallbackUrl);
        return;
    }
    imgEl.onerror = () => {
        imgEl.onerror = null;
        if (imgEl.getAttribute('src') !== fallbackUrl) {
            imgEl.src = fallbackUrl;
        }
    };
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
        const fallback = typeof HERO_VIEW_ICON_FALLBACK === 'string' && HERO_VIEW_ICON_FALLBACK
            ? HERO_VIEW_ICON_FALLBACK
            : TOOLTIP_ICON_FALLBACK;
        const resolvedIcon = typeof resolveAssetUrl === 'function'
            ? resolveAssetUrl(icon, fallback)
            : (icon || fallback);

        applyTooltipIconFallback(tipIcon, fallback);
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

    const detailLines = Array.isArray(details)
        ? details.filter(Boolean)
        : (details ? [String(details)] : []);

    if (tipCooldown) {
        if (detailLines.length > 0) {
            tipCooldown.innerHTML = detailLines
                .map(line => `<div class="hots-tooltip-stat-line">${cleanTooltipInlineText(line)}</div>`)
                .join('');
            tipCooldown.classList.remove('hidden');
        } else {
            tipCooldown.innerHTML = '';
            tipCooldown.classList.add('hidden');
        }
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
