// ==========================================
// 2. PATCH NOTES FORMATTING & SUMMARIES
// ==========================================

const MAJOR_SECTION_TITLES = new Set([
    'new hero',
    'collection',
    'general',
    'map updates',
    'balance update',
    'bug fixes',
    'heroes',
    'maps',
    'releases',
    'updates'
]);

const SUB_CATEGORY_TITLES = new Set([
    'base',
    'talents',
    'abilities',
    'heroic abilities',
    'trait',
    'objective',
    'overview',
    'general',
    'updates',
    'bug fixes'
]);

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
        const parsed = new URL(trimmed, window.location.origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function isLevelHeader(text) {
    return /^level\s+\d+$/i.test(String(text || '').trim());
}

function isHeroSubheading(text, nextText, currentMajor) {
    const clean = String(text || '').trim();
    if (!clean || clean.length > 35 || /[.!?:]/.test(clean)) return false;
    if (/\b(increased|reduced|decreased|added|removed|fixed|updated)\b/i.test(clean)) return false;

    const inHeroContext =
        currentMajor === 'heroes' ||
        currentMajor === 'balance update' ||
        currentMajor === 'bug fixes';

    if (!inHeroContext) return false;

    const nextClean = String(nextText || '').trim().toLowerCase();
    return (
        SUB_CATEGORY_TITLES.has(nextClean) ||
        isLevelHeader(nextClean) ||
        /^(fixed an issue|updated|adjusted|increased|reduced|decreased|added|removed)\b/i.test(nextClean)
    );
}

function isAbilityOrTalentHeader(text, nextText) {
    const clean = String(text || '').trim().replace(/:$/, '');
    if (!clean || clean.length > 65) return false;
    if (/[.!?]$/.test(clean)) return false;

    const lower = clean.toLowerCase();
    if (MAJOR_SECTION_TITLES.has(lower) || SUB_CATEGORY_TITLES.has(lower) || isLevelHeader(clean)) {
        return false;
    }

    if (/\[[QWERD1-6]\]\s*$/i.test(clean)) {
        return true;
    }

    if (/\b(increased|reduced|decreased|added|removed|fixed|updated|now provides|cooldown|mana cost|damage|healing)\b/i.test(clean)) {
        return false;
    }

    return Boolean(nextText && !/^={2,}/.test(nextText) && !/^\[[^\]]+\]$/.test(nextText));
}

function normalizeBlizzlikePatchText(rawText) {
    if (!rawText) return '';

    const rawLines = String(rawText).replace(/\r\n/g, '\n').split('\n');
    const normalized = [];
    let inQuickNav = false;
    let currentMajor = '';

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            normalized.push('');
            continue;
        }

        if (/^quick navigation:?$/i.test(trimmed)) {
            inQuickNav = true;
            continue;
        }

        if (/^return to top$/i.test(trimmed)) {
            inQuickNav = false;
            continue;
        }

        if (inQuickNav) continue;

        if (/^={2,}\s*.+?\s*={2,}$/.test(trimmed)) {
            const inner = trimmed.replace(/^={2,}\s*|\s*={2,}$/g, '').trim();
            if (/^heroes:\s*(.+)$/i.test(inner)) {
                currentMajor = 'heroes';
            } else if (/^new hero:\s*(.+)$/i.test(inner)) {
                currentMajor = 'new hero';
            } else {
                currentMajor = inner.toLowerCase();
            }
            normalized.push(trimmed);
            continue;
        }

        if (/^\[[^\]]+\]$/.test(trimmed)) {
            normalized.push(trimmed);
            continue;
        }

        const newHeroMatch = trimmed.match(/^new hero:\s*(.+)$/i);
        if (newHeroMatch) {
            currentMajor = 'new hero';
            normalized.push(`== New Hero: ${newHeroMatch[1].trim()} ==`);
            continue;
        }

        const battlegroundMatch = trimmed.match(/^battlegrounds:\s*(.+)$/i);
        if (battlegroundMatch) {
            currentMajor = 'map updates';
            normalized.push('== Map Updates ==');
            normalized.push(`[${battlegroundMatch[1].trim()}]`);
            continue;
        }

        const lower = trimmed.toLowerCase();
        if (MAJOR_SECTION_TITLES.has(lower)) {
            currentMajor = lower;
            normalized.push(`== ${trimmed} ==`);
            continue;
        }

        if (SUB_CATEGORY_TITLES.has(lower) || isLevelHeader(trimmed)) {
            normalized.push(`[${trimmed}]`);
            continue;
        }

        const existingBullet = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (existingBullet) {
            const spaces = existingBullet[1].replace(/\t/g, '  ').length;
            const indent = '  '.repeat(Math.floor(spaces / 2));
            normalized.push(`${indent}- ${existingBullet[2].trim()}`);
            continue;
        }

        let nextTrimmed = '';
        for (let j = i + 1; j < rawLines.length; j++) {
            const candidate = rawLines[j].trim();
            if (candidate && !/^return to top$/i.test(candidate)) {
                nextTrimmed = candidate;
                break;
            }
        }

        if (isHeroSubheading(trimmed, nextTrimmed, currentMajor)) {
            normalized.push(`== Heroes: ${trimmed} ==`);
            continue;
        }

        if (isAbilityOrTalentHeader(trimmed, nextTrimmed)) {
            normalized.push(`- ${trimmed}`);
        } else {
            normalized.push(`  - ${trimmed}`);
        }
    }

    return normalized.join('\n');
}

function formatBlizzLine(text) {
    let safe = escapeHtml(text);

    safe = safe.replace(
        /\[Undocumented\]/gi,
        '<span class="inline-flex items-center px-1.5 py-0.5 mr-1 text-[10px] font-mono font-semibold uppercase tracking-wide rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Undocumented</span>'
    );

    safe = safe.replace(
        /~~(.+?)~~/g,
        '<del class="text-slate-500 line-through decoration-rose-400/70">$1</del>'
    );

    safe = safe.replace(
        /\[([QWERD1-6])\]/g,
        '<span class="inline-block px-1 py-0.2 mx-0.5 text-[11px] font-mono font-bold rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">[$1]</span>'
    );

    safe = safe.replace(
        /^([A-Za-z0-9'’().\-\s/+\[\]]{2,55}?):(\s|$)/,
        '<strong class="font-semibold text-white">$1:</strong>$2'
    );

    return safe;
}

function formatBlizzlikePatchNotesHtml(rawText) {
    if (!rawText) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const normalized = normalizeBlizzlikePatchText(rawText).trim();
    if (!normalized) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const lines = normalized.split('\n');
    const htmlParts = [];
    let listStack = [];
    let isFirstMajorHeading = true;

    const listStyleByDepth = [
        'list-disc pl-5 space-y-1.5 text-[14px] text-slate-200 marker:text-sky-400/80',
        'list-[circle] pl-5 mt-1.5 space-y-1 text-[13.5px] text-slate-300 marker:text-slate-500',
        'list-[square] pl-5 mt-1 space-y-1 text-[13px] text-slate-400 marker:text-slate-600'
    ];

    function renderNode(node, depth = 0) {
        const ulClass = listStyleByDepth[Math.min(depth, listStyleByDepth.length - 1)];
        const itemsHtml = node.items.map(item => {
            const nestedHtml = item.children.length
                ? renderNode({ indent: item.indent + 1, items: item.children }, depth + 1)
                : '';
            return `<li class="leading-relaxed">${formatBlizzLine(item.text)}${nestedHtml}</li>`;
        }).join('');
        return `<ul class="${ulClass}">${itemsHtml}</ul>`;
    }

    function flushList() {
        if (!listStack.length) return;
        htmlParts.push(renderNode(listStack[0], 0));
        listStack = [];
    }

    function addBullet(text, indentLevel) {
        const nextItem = { indent: indentLevel, text, children: [] };

        if (!listStack.length) {
            listStack.push({ indent: indentLevel, items: [nextItem] });
            return;
        }

        const top = listStack[listStack.length - 1];
        if (indentLevel > top.indent) {
            const lastParent = top.items[top.items.length - 1];
            if (lastParent) {
                lastParent.children.push(nextItem);
                listStack.push({ indent: indentLevel, items: lastParent.children });
            } else {
                top.items.push(nextItem);
            }
            return;
        }

        while (listStack.length > 1 && listStack[listStack.length - 1].indent > indentLevel) {
            listStack.pop();
        }

        listStack[listStack.length - 1].items.push(nextItem);
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            flushList();
            continue;
        }

        const majorMatch = trimmed.match(/^={2,}\s*(.+?)\s*={2,}$/);
        if (majorMatch) {
            flushList();
            const headingText = majorMatch[1].trim();
            const newHeroMatch = headingText.match(/^New Hero:\s*(.+)$/i);
            const heroMatch = headingText.match(/^Heroes:\s*(.+)$/i);

            if (newHeroMatch) {
                const topSpacing = isFirstMajorHeading ? 'pt-1 mt-0 border-t-0' : 'pt-7 mt-6 border-t border-slate-800';
                isFirstMajorHeading = false;
                htmlParts.push(
                    `<div class="${topSpacing} pb-1">
                        <span class="block text-[11px] font-mono font-bold uppercase tracking-widest text-amber-300/90 mb-1">New Hero</span>
                        <h2 class="text-2xl font-bold text-white tracking-tight">${escapeHtml(newHeroMatch[1].trim())}</h2>
                    </div>`
                );
            } else if (heroMatch) {
                htmlParts.push(
                    `<h3 class="text-xl font-bold text-sky-200 pt-5 pb-1 mt-4 border-t border-slate-800/80 tracking-tight">${escapeHtml(heroMatch[1].trim())}</h3>`
                );
            } else {
                const topSpacing = isFirstMajorHeading ? 'pt-1 mt-0 border-t-0' : 'pt-7 mt-6 border-t border-slate-800';
                isFirstMajorHeading = false;
                htmlParts.push(
                    `<h2 class="text-2xl font-bold text-white ${topSpacing} pb-1.5 tracking-tight">${escapeHtml(headingText)}</h2>`
                );
            }
            continue;
        }

        const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*$/);
        if (bracketMatch) {
            flushList();
            const label = bracketMatch[1].trim();
            htmlParts.push(
                `<h4 class="text-base font-bold text-slate-100 pt-3.5 pb-0.5">${escapeHtml(label)}</h4>`
            );
            continue;
        }

        const bulletMatch = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (bulletMatch) {
            const spaces = bulletMatch[1].replace(/\t/g, '  ').length;
            const indentLevel = Math.floor(spaces / 2);
            addBullet(bulletMatch[2].trim(), indentLevel);
            continue;
        }

        const cleanSubheading = trimmed.replace(/:$/, '');
        const isStandaloneSubheading =
            cleanSubheading.length <= 48 &&
            !/[.!?]$/.test(cleanSubheading) &&
            !/\b(increased|reduced|decreased|added|removed|fixed|updated)\b/i.test(cleanSubheading);

        if (isStandaloneSubheading) {
            flushList();
            htmlParts.push(
                `<h4 class="text-[15px] font-bold text-slate-100 pt-3 pb-0.5">${escapeHtml(cleanSubheading)}</h4>`
            );
            continue;
        }

        flushList();
        htmlParts.push(
            `<p class="text-[14px] text-slate-300 leading-relaxed">${formatBlizzLine(trimmed)}</p>`
        );
    }

    flushList();
    return htmlParts.join('\n');
}

function buildPatchTldr(patch, rawNotesOverride = '') {
    if (!patch) return 'No patch notes available yet.';
    const raw = String(rawNotesOverride || patch.inlineNotes || '').replace(/\r\n/g, '\n');
    const lines = raw
        .split('\n')
        .map(l => l.trim().replace(/^={2,}\s*|\s*={2,}$/g, '').replace(/^(?:•|[-*])\s+/, ''))
        .filter(l => l && !/^quick navigation:?$/i.test(l) && !/^return to top$/i.test(l));

    if (lines.length >= 2) {
        return `${lines[0]} — ${lines[1]}`.slice(0, 150);
    }
    if (lines.length === 1) {
        return lines[0].slice(0, 150);
    }
    return patch.patchVersion
        ? `Build ${patch.build || patch.patchVersion} patch notes and balance updates.`
        : 'Open patch notes for full details.';
}
