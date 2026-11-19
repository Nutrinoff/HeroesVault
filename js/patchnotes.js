// ==========================================
// PATCH NOTES MODULE (4 MASTER LISTS + PER-PATCH FILES)
// ==========================================

let CURRENT_FILTER = 'all'; // 'all', 'live', or 'ptr' (plus era metadata on items)
let ACTIVE_PATCH_ITEMS = [];
let CACHED_MASTER_PATCHES = null;
const PATCH_DETAIL_CACHE = new Map();

const PATCH_DATA_DIR = './data/patchnotes';
const DEFAULT_HOTS_URL = 'https://news.blizzard.com/en-us/heroes-of-the-storm';

const MASTER_SOURCES = [
    { file: 'alpha-master.json', defaultFeed: 'live', defaultEra: 'alpha' },
    { file: 'beta-master.json',  defaultFeed: 'live', defaultEra: 'beta' },
    { file: 'live-master.json',  defaultFeed: 'live', defaultEra: 'live' },
    { file: 'ptr-master.json',   defaultFeed: 'ptr',  defaultEra: 'ptr' }
];

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

function shouldRemovePatch(item) {
    if (!item || typeof item !== 'object') return true;
    const subtitle = String(item.Subtitle ?? item.subtitle ?? '').trim().toUpperCase();
    return subtitle === 'REMOVE' || item._remove === true;
}

function parsePatchTimestamp(item) {
    const candidates = [item?.isoDate, item?.IsoDate, item?.liveDate, item?.date, item?.Date];
    for (const raw of candidates) {
        if (!raw) continue;
        const ts = Date.parse(raw);
        if (!Number.isNaN(ts)) return ts;
    }
    return 0;
}

function formatPatchDisplayDate(rawDate, fallback = 'Unknown Date') {
    if (!rawDate) return fallback;
    const ts = Date.parse(rawDate);
    if (Number.isNaN(ts)) return String(rawDate);
    return new Date(ts).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function formatSidebarShortDate(rawDate, fallback = 'Unknown') {
    if (!rawDate) return fallback;
    const ts = Date.parse(rawDate);
    if (Number.isNaN(ts)) return String(rawDate);
    return new Date(ts).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function resolveDetailPaths(item, era, id) {
    const explicit =
        item.detailFile ||
        item.DetailFile ||
        item.patchFile ||
        item.PatchFile ||
        item.notesFile ||
        item.NotesFile ||
        item.file ||
        item.File ||
        item.path ||
        item.Path ||
        '';

    const cleanExplicit = String(explicit || '').trim().replace(/^\/+/, '');
    const safeEra = ['alpha', 'beta', 'live', 'ptr'].includes(era) ? era : 'live';
    const safeId = encodeURIComponent(String(id || '').trim());

    const candidates = [];

    if (cleanExplicit) {
        if (cleanExplicit.startsWith('data/patchnotes/')) {
            candidates.push(`./${cleanExplicit}`);
        } else if (cleanExplicit.startsWith('./')) {
            candidates.push(cleanExplicit);
        } else if (cleanExplicit.includes('/')) {
            candidates.push(`${PATCH_DATA_DIR}/${cleanExplicit}`);
        } else {
            candidates.push(`${PATCH_DATA_DIR}/${safeEra}/${cleanExplicit}`);
        }
    }

    if (safeId) {
        candidates.push(`${PATCH_DATA_DIR}/${safeEra}/${safeId}.json`);
        candidates.push(`${PATCH_DATA_DIR}/${safeEra}/${safeId}.txt`);
    }

    return [...new Set(candidates)];
}

function extractInlineNotes(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload.trim();
    if (typeof payload !== 'object') return '';

    const candidates = [
        payload.patchNotes,
        payload.PatchNotes,
        payload.cleanedPatchNotes,
        payload.CleanedPatchNotes,
        payload.notes,
        payload.Notes,
        payload.body,
        payload.Body,
        payload.content,
        payload.Content,
        payload.description,
        payload.Description
    ];

    for (const val of candidates) {
        if (typeof val === 'string' && val.trim()) {
            return val.trim();
        }
    }
    return '';
}

function formatPatchNotesHtml(rawText) {
    if (!rawText) {
        return `<p class="text-slate-400 italic">No detailed patch note text recorded for this build.</p>`;
    }

    if (/<(p|ul|ol|div|section|article|table|h[1-6])\b/i.test(rawText) && !rawText.includes('===')) {
        return rawText;
    }

    const normalized = rawText.replace(/\r\n/g, '\n').trim();
    const lines = normalized.split('\n');

    const blocks = [];
    let currentSection = null;
    let listStack = [];

    function flushList() {
        if (!listStack.length) return;
        blocks.push(renderListNode(listStack[0]));
        listStack = [];
    }

    function renderListNode(node) {
        const lis = node.items.map(entry => {
            const childrenHtml = entry.children.length
                ? `<ul class="list-disc pl-5 mt-1.5 space-y-1 text-slate-300">${entry.children.map(renderListItem).join('')}</ul>`
                : '';
            return `<li class="leading-relaxed">${formatInlineHighlight(entry.text)}${childrenHtml}</li>`;
        }).join('');
        return `<ul class="list-disc pl-5 space-y-1.5 text-slate-200">${lis}</ul>`;
    }

    function renderListItem(entry) {
        const childrenHtml = entry.children.length
            ? `<ul class="list-disc pl-5 mt-1 space-y-1 text-slate-300">${entry.children.map(renderListItem).join('')}</ul>`
            : '';
        return `<li class="leading-relaxed">${formatInlineHighlight(entry.text)}${childrenHtml}</li>`;
    }

    function addBullet(text, indentLevel) {
        if (!listStack.length) {
            listStack.push({ indent: indentLevel, items: [{ text, children: [] }] });
            return;
        }

        const top = listStack[listStack.length - 1];
        if (indentLevel > top.indent) {
            const parentItems = listStack[listStack.length - 1].items;
            const lastParent = parentItems[parentItems.length - 1];
            if (lastParent) {
                lastParent.children.push({ text, children: [] });
            } else {
                parentItems.push({ text, children: [] });
            }
            listStack.push({ indent: indentLevel, items: lastParent ? lastParent.children : parentItems });
        } else {
            while (listStack.length > 1 && indentLevel < listStack[listStack.length - 1].indent) {
                listStack.pop();
            }
            listStack[listStack.length - 1].items.push({ text, children: [] });
        }
    }

    function openSection(title) {
        flushList();
        currentSection = title;
        blocks.push(`
            <div class="pt-4 first:pt-0 mt-5 first:mt-0 border-t first:border-t-0 border-slate-800/90">
                <h3 class="text-base font-bold tracking-tight text-sky-300 flex items-center gap-2 mb-2.5">
                    <span class="w-1.5 h-4 rounded-full bg-sky-400 inline-block"></span>
                    ${escapeHtml(title)}
                </h3>
                <div class="space-y-2.5">
        `);
    }

    function closeSectionIfOpen() {
        flushList();
        if (currentSection !== null) {
            blocks.push(`</div></div>`);
            currentSection = null;
        }
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            flushList();
            continue;
        }

        const sectionMatch = trimmed.match(/^={2,}\s*(.+?)\s*={2,}$/);
        if (sectionMatch) {
            closeSectionIfOpen();
            openSection(sectionMatch[1]);
            continue;
        }

        const subGroupMatch = trimmed.match(/^\[(Updates|Bug Fixes|Fixes|Changes|Releases)\]\s*$/i);
        if (subGroupMatch) {
            flushList();
            const label = subGroupMatch[1];
            const isFix = /bug fix|fix/i.test(label);
            const badgeStyle = isFix
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                : 'text-sky-300 bg-sky-500/10 border-sky-500/30';
            blocks.push(`
                <div class="mt-2 mb-1">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${badgeStyle}">
                        ${escapeHtml(label)}
                    </span>
                </div>
            `);
            continue;
        }

        const bulletMatch = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (bulletMatch) {
            const leadingSpaces = bulletMatch[1].replace(/\t/g, '    ').length;
            const indentLevel = Math.floor(leadingSpaces / 2);
            addBullet(bulletMatch[2].trim(), indentLevel);
            continue;
        }

        flushList();
        blocks.push(`<p class="text-sm text-slate-300 leading-relaxed">${formatInlineHighlight(trimmed)}</p>`);
    }

    closeSectionIfOpen();
    return blocks.join('\n');
}

function formatInlineHighlight(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(
        /^([A-Za-z0-9'’().\- /+]+?):(\s|$)/,
        '<strong class="font-semibold text-white">$1:</strong>$2'
    );
    safe = safe.replace(
        /\b(from)\s+([^,\s.;]+(?:\s+[^,\s.;]+){0,2}?)\s+(to)\s+([^,.;)]+)/gi,
        '$1 <span class="font-mono text-rose-300/90">$2</span> $3 <span class="font-mono text-emerald-300">$4</span>'
    );
    return safe;
}

function normalizeMasterEntry(item, sourceMeta, index) {
    if (!item || typeof item !== 'object' || shouldRemovePatch(item)) return null;

    const rawDate = item.IsoDate || item.isoDate || item.Date || item.date || item.liveDate || null;
    const ts = rawDate ? Date.parse(rawDate) : NaN;
    const validIso = !Number.isNaN(ts) ? new Date(ts).toISOString() : null;

    const rawFeed = String(item.FeedType ?? item.feedType ?? '').toLowerCase();
    const feedType = rawFeed === 'ptr' || rawFeed === 'live'
        ? rawFeed
        : sourceMeta.defaultFeed;

    const era = String(item.Era ?? item.era ?? sourceMeta.defaultEra).toLowerCase();
    const isLegacy = Boolean(
        item.isLegacy ||
        item.IsLegacy ||
        era === 'alpha' ||
        era === 'beta' ||
        (validIso && new Date(validIso).getUTCFullYear() <= 2021)
    );

    const rawLink = item.Link ?? item.link ?? item.officialLink ?? item.alternateLink ?? '';
    const link = isSafeUrl(rawLink) ? String(rawLink).trim() : DEFAULT_HOTS_URL;

    const id = String(
        item.Id ??
        item.id ??
        item.internalId ??
        `${era}-${index + 1}`
    ).trim();

    const title = String(
        item.Title ??
        item.title ??
        item.patchName ??
        id
    ).trim();

    const patchVersion = String(item.PatchVersion ?? item.patchVersion ?? item.gameVersion ?? '').trim() || null;
    const fullVersion = String(item.FullVersion ?? item.fullVersion ?? '').trim() || null;
    const build = String(item.Build ?? item.build ?? item.liveBuild ?? '').trim() || null;
    const inlineNotes = extractInlineNotes(item);

    return {
        id,
        title,
        subtitle: String(item.Subtitle ?? item.subtitle ?? '').trim() || null,
        date: item.Date || item.date || (validIso ? formatPatchDisplayDate(validIso) : 'Unknown Date'),
        shortDate: validIso ? formatSidebarShortDate(validIso) : formatSidebarShortDate(rawDate),
        isoDate: validIso,
        feedType,
        era,
        patchVersion,
        fullVersion,
        build,
        isLegacy,
        link,
        inlineNotes,
        detailPaths: resolveDetailPaths(item, era, id)
    };
}

function deduplicateAndSortPatches(items) {
    const seen = new Map();

    for (const item of items) {
        if (!item || shouldRemovePatch(item)) continue;
        const key = `id:${String(item.id).trim().toLowerCase()}`;
        if (!seen.has(key)) {
            seen.set(key, item);
        }
    }

    return Array.from(seen.values()).sort((a, b) => {
        const diff = parsePatchTimestamp(b) - parsePatchTimestamp(a);
        if (diff !== 0) return diff;
        return String(b.id).localeCompare(String(a.id));
    });
}

async function fetchAllMasterPatches() {
    if (Array.isArray(CACHED_MASTER_PATCHES)) {
        return CACHED_MASTER_PATCHES;
    }

    const responses = await Promise.all(
        MASTER_SOURCES.map(src =>
            fetch(`${PATCH_DATA_DIR}/${src.file}`).catch(() => ({ ok: false }))
        )
    );

    const allNormalized = [];

    for (let i = 0; i < MASTER_SOURCES.length; i++) {
        const res = responses[i];
        const meta = MASTER_SOURCES[i];
        if (!res || !res.ok) continue;

        const data = await res.json();
        const rows = Array.isArray(data)
            ? data
            : (Array.isArray(data?.patches) ? data.patches : (Array.isArray(data?.items) ? data.items : []));

        rows.forEach((row, idx) => {
            const normalized = normalizeMasterEntry(row, meta, idx);
            if (normalized) allNormalized.push(normalized);
        });
    }

    CACHED_MASTER_PATCHES = deduplicateAndSortPatches(allNormalized);
    return CACHED_MASTER_PATCHES;
}

async function fetchPatchDetailHtml(item) {
    if (PATCH_DETAIL_CACHE.has(item.id)) {
        return PATCH_DETAIL_CACHE.get(item.id);
    }

    if (item.inlineNotes) {
        const html = formatPatchNotesHtml(item.inlineNotes);
        PATCH_DETAIL_CACHE.set(item.id, html);
        return html;
    }

    for (const candidateUrl of item.detailPaths) {
        try {
            const res = await fetch(candidateUrl);
            if (!res.ok) continue;

            const rawBody = await res.text();
            if (!rawBody.trim()) continue;

            let extracted = rawBody.trim();
            if (candidateUrl.endsWith('.json')) {
                const parsed = JSON.parse(rawBody);
                extracted = extractInlineNotes(parsed) || rawBody.trim();
            }

            const html = formatPatchNotesHtml(extracted);
            PATCH_DETAIL_CACHE.set(item.id, html);
            return html;
        } catch {
            // Try next candidate path
        }
    }

    const fallbackHtml = `<p class="text-slate-400 italic">Patch detail file not found yet for <span class="font-mono text-slate-300">${escapeHtml(item.id)}</span>.</p>`;
    PATCH_DETAIL_CACHE.set(item.id, fallbackHtml);
    return fallbackHtml;
}

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    renderPatchHeaderControls();

    listContainer.innerHTML = `
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">
            ${escapeHtml(CURRENT_FILTER.toUpperCase())} Updates
        </h3>
        <div class="text-xs text-sky-400 p-3 animate-pulse">Loading master lists...</div>
    `;

    try {
        const allPatches = await fetchAllMasterPatches();

        if (CURRENT_FILTER === 'live') {
            ACTIVE_PATCH_ITEMS = allPatches.filter(item => item.feedType === 'live');
        } else if (CURRENT_FILTER === 'ptr') {
            ACTIVE_PATCH_ITEMS = allPatches.filter(item => item.feedType === 'ptr');
        } else {
            ACTIVE_PATCH_ITEMS = allPatches;
        }

        if (ACTIVE_PATCH_ITEMS.length === 0) {
            listContainer.innerHTML = `
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Updates</h3>
                <div class="text-xs text-slate-400 p-3 italic">No updates found in this category.</div>
            `;
            const mainContent = document.getElementById('patch-main-content');
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-6 text-slate-400 text-sm">No patch notes available right now.</div>`;
            }
            return;
        }

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.warn('Failed to load master patch lists:', err);

        ACTIVE_PATCH_ITEMS = [
            {
                id: 'fallback-item',
                title: 'Heroes of the Storm Update Feed',
                date: 'Recent',
                shortDate: 'Recent',
                feedType: 'live',
                era: 'live',
                isLegacy: false,
                link: DEFAULT_HOTS_URL,
                inlineNotes: 'Master patch lists are syncing or not yet available.'
            }
        ];

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);
    }
}

function renderPatchHeaderControls() {
    const parentContainer = document.getElementById('patch-sidebar-list')?.parentElement;
    if (!parentContainer) return;

    let controlNav = document.getElementById('patch-type-toggle');
    if (!controlNav) {
        controlNav = document.createElement('div');
        controlNav.id = 'patch-type-toggle';
        controlNav.className = 'grid grid-cols-3 gap-1.5 mb-4 px-2';
        controlNav.innerHTML = `
            <button id="filter-btn-all" type="button" onclick="switchPatchFilter('all')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'all' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">All</button>
            <button id="filter-btn-live" type="button" onclick="switchPatchFilter('live')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'live' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">Live</button>
            <button id="filter-btn-ptr" type="button" onclick="switchPatchFilter('ptr')" class="py-1.5 px-2 rounded-lg text-xs font-bold transition border ${CURRENT_FILTER === 'ptr' ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'}">PTR</button>
        `;
        parentContainer.prepend(controlNav);
    }
}

window.switchPatchFilter = function(filterType) {
    if (CURRENT_FILTER === filterType) return;
    CURRENT_FILTER = filterType;

    ['all', 'live', 'ptr'].forEach(type => {
        const btn = document.getElementById(`filter-btn-${type}`);
        if (btn) {
            btn.className = type === filterType
                ? 'py-1.5 px-2 rounded-lg text-xs font-bold transition border bg-sky-500 text-slate-950 border-sky-400'
                : 'py-1.5 px-2 rounded-lg text-xs font-bold transition border bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800';
        }
    });

    loadLivePatchNotes();
};

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER.toUpperCase())} Feed</h3>
            <span class="text-[10px] font-mono text-slate-500">${items.length}</span>
        </div>
    `;

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-${CSS.escape(item.id)}`;
        btn.className = 'w-full text-left p-3 rounded-xl border border-slate-800/90 bg-slate-950/50 hover:bg-slate-800/80 hover:border-slate-700 transition space-y-1.5 group';
        btn.onclick = () => selectPatchItem(item.id);

        const badgeColor = item.feedType === 'ptr'
            ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
            : 'text-sky-300 bg-sky-500/10 border-sky-500/30';
        const badgeText = item.feedType ? item.feedType.toUpperCase() : 'NOTE';
        const eraBadge = ['alpha', 'beta'].includes(item.era) ? item.era.toUpperCase() : '';
        const versionTag = item.patchVersion || item.build || '';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-mono text-slate-400">${escapeHtml(item.shortDate || item.date)}</span>
                <div class="flex items-center gap-1 shrink-0">
                    ${eraBadge ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono text-purple-300 bg-purple-500/10 border-purple-500/30">${escapeHtml(eraBadge)}</span>` : ''}
                    ${versionTag ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono text-slate-300 bg-slate-900 border-slate-700/80">${escapeHtml(versionTag)}</span>` : ''}
                    ${CURRENT_FILTER === 'all' ? `<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ${badgeColor}">${escapeHtml(badgeText)}</span>` : ''}
                </div>
            </div>
            <h4 class="text-xs font-bold text-slate-200 group-hover:text-white line-clamp-2 leading-snug">${escapeHtml(item.title)}</h4>
        `;
        listContainer.appendChild(btn);
    });
}

async function selectPatchItem(id) {
    const item = ACTIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    document.querySelectorAll('#patch-sidebar-list button').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });

    const activeBtn = document.getElementById(`btn-${CSS.escape(id)}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-sky-500/15', 'border-sky-500/70');
    }

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    const ctaLabel = item.link.includes('reddit.com')
        ? 'View Source Thread on Reddit'
        : 'View Full Article on Blizzard';

    const buildMeta = [
        item.era ? `Era <span class="text-slate-200 font-semibold uppercase">${escapeHtml(item.era)}</span>` : null,
        item.patchVersion ? `Patch <span class="text-slate-200 font-semibold">${escapeHtml(item.patchVersion)}</span>` : null,
        item.fullVersion && item.fullVersion !== item.patchVersion ? `Version <span class="text-slate-200 font-semibold">${escapeHtml(item.fullVersion)}</span>` : null,
        item.build ? `Build <span class="text-slate-200 font-semibold">${escapeHtml(item.build)}</span>` : null
    ].filter(Boolean);

    mainContent.innerHTML = `
        <article class="space-y-5">
            <header class="border-b border-slate-800 pb-4 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-mono text-sky-400">${escapeHtml(item.date)}</span>
                    ${item.feedType ? `<span class="text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${item.feedType === 'ptr' ? 'text-amber-300 bg-amber-500/10 border-amber-500/30' : 'text-sky-300 bg-sky-500/10 border-sky-500/30'}">${escapeHtml(item.feedType)}</span>` : ''}
                    ${item.isLegacy ? `<span class="text-[10px] px-2 py-0.5 rounded border font-mono uppercase text-slate-300 bg-slate-800/90 border-slate-700">Archive</span>` : ''}
                </div>
                <h2 class="text-2xl font-bold text-white tracking-tight">${escapeHtml(item.title)}</h2>
                ${buildMeta.length ? `<div class="text-xs font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">${buildMeta.join('<span>·</span>')}</div>` : ''}
            </header>

            <div id="patch-notes-body" class="text-sm text-slate-300 leading-relaxed space-y-3">
                <div class="text-xs text-sky-400 py-2 animate-pulse">Loading patch notes from ${escapeHtml(item.era)}...</div>
            </div>

            <footer class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold inline-flex items-center gap-2 transition">
                    ${escapeHtml(ctaLabel)} <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </footer>
        </article>
    `;

    if (window.lucide) lucide.createIcons();

    const notesHtml = await fetchPatchDetailHtml(item);
    const bodyEl = document.getElementById('patch-notes-body');
    if (bodyEl && ACTIVE_PATCH_ITEMS.some(x => x.id === id)) {
        bodyEl.innerHTML = notesHtml;
    }
}
