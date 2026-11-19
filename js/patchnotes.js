// ==========================================
// PATCH NOTES MODULE (BLIZZLIKE VIEW & 4-MASTER SYSTEM)
// ==========================================

let CURRENT_FILTER = 'all'; // 'all', 'live', or 'ptr'
let ACTIVE_PATCH_ITEMS = [];
let CACHED_MASTER_PATCHES = null;
const PATCH_DETAIL_CACHE = new Map();

const PATCH_DATA_DIR = './data/patchnotes';
const DEFAULT_HOTS_URL = 'https://news.blizzard.com/en-us/heroes-of-the-storm';

// Technical Alpha ended March 24, 2015; Closed Beta ran March 25 – June 1, 2015
const ALPHA_CUTOFF_TS = Date.parse('2015-03-25T00:00:00Z');
const BETA_CUTOFF_TS = Date.parse('2015-06-02T00:00:00Z');
const ARCHIVE_CUTOFF_TS = Date.parse('2022-01-01T00:00:00Z');

const MASTER_SOURCES = [
    { file: 'alpha-master.json', defaultFeed: 'live', sourceEra: 'alpha' },
    { file: 'beta-master.json',  defaultFeed: 'live', sourceEra: 'beta' },
    { file: 'live-master.json',  defaultFeed: 'live', sourceEra: 'live' },
    { file: 'ptr-master.json',   defaultFeed: 'ptr',  sourceEra: 'ptr' }
];

const ACTIVE_FILTER_CLASSES = ['bg-sky-500', 'text-slate-950', 'border-sky-400', 'shadow-sm'];
const INACTIVE_FILTER_CLASSES = ['bg-slate-900/90', 'text-slate-300', 'border-slate-700/80', 'hover:bg-slate-800', 'hover:text-white'];

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

function formatSidebarDate(rawDate, fallback = 'Unknown') {
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

function formatBlizzDisplayTitle(rawTitle, displayDate, feedType, era) {
    const cleanTitle = String(rawTitle || '').trim();
    const datePart = displayDate && displayDate !== 'Unknown Date' ? displayDate : '';

    if (/^Heroes of the Storm\b.*\bPatch Notes\b/i.test(cleanTitle)) {
        if (datePart && !cleanTitle.includes(datePart)) {
            return `${cleanTitle.replace(/\s*-\s*[^-]+$/, '')} - ${datePart}`;
        }
        return cleanTitle;
    }

    let channelLabel = 'Live';
    if (feedType === 'ptr') {
        channelLabel = 'PTR';
    } else if (era === 'alpha') {
        channelLabel = 'Alpha';
    } else if (era === 'beta') {
        channelLabel = 'Beta';
    }

    return datePart
        ? `Heroes of the Storm ${channelLabel} Patch Notes - ${datePart}`
        : `Heroes of the Storm ${channelLabel} Patch Notes`;
}

function inferTrueEra(validIso, sourceEra, title, id) {
    const combined = `${title} ${id}`.toLowerCase();
    const ts = validIso ? Date.parse(validIso) : NaN;

    if (!Number.isNaN(ts)) {
        if (ts < ALPHA_CUTOFF_TS) return 'alpha';
        if (ts < BETA_CUTOFF_TS) return 'beta';
        if (sourceEra === 'ptr' || combined.includes('ptr')) return 'ptr';
        return 'live';
    }

    if (sourceEra === 'ptr' || combined.includes('ptr')) return 'ptr';
    if (sourceEra === 'alpha' && combined.includes('alpha')) return 'alpha';
    if (sourceEra === 'beta' && combined.includes('beta')) return 'beta';
    return 'live';
}

function inferFeedType(item, sourceMeta, title) {
    const rawFeed = String(item.FeedType ?? item.feedType ?? '').trim().toLowerCase();
    const combined = `${item.patchType || ''} ${title}`.toLowerCase();

    if (rawFeed === 'ptr' || combined.includes('ptr')) return 'ptr';
    if (rawFeed === 'live') return 'live';
    return sourceMeta.defaultFeed || 'live';
}

function resolveDetailPath(item, era) {
    const explicit =
        item.PatchFile ||
        item.patchFile ||
        item.detailFile ||
        item.DetailFile ||
        item.notesFile ||
        item.NotesFile ||
        item.file ||
        item.File ||
        item.path ||
        item.Path ||
        '';

    const clean = String(explicit || '').trim().replace(/^\/+/, '');
    if (!clean) return null;

    if (clean.startsWith('data/patchnotes/')) {
        return `./${clean}`;
    }
    if (clean.startsWith('./data/patchnotes/')) {
        return clean;
    }
    if (clean.includes('/')) {
        return `${PATCH_DATA_DIR}/${clean}`;
    }

    const safeFolder = ['alpha', 'beta', 'live', 'ptr'].includes(era) ? era : 'live';
    return `${PATCH_DATA_DIR}/${safeFolder}/${clean}`;
}

function extractPatchNotesText(payload) {
    if (!payload) return '';

    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return extractPatchNotesText(JSON.parse(trimmed));
            } catch {
                return '';
            }
        }
        return trimmed;
    }

    if (typeof payload !== 'object') return '';

    const keys = [
        'CleanedNotes',
        'cleanedNotes',
        'PatchNotes',
        'patchNotes',
        'CleanedPatchNotes',
        'cleanedPatchNotes',
        'RawPatchNotes',
        'rawPatchNotes',
        'Notes',
        'notes',
        'Body',
        'body',
        'Content',
        'content',
        'Text',
        'text'
    ];

    for (const key of keys) {
        const val = payload[key];
        if (typeof val === 'string' && val.trim()) {
            return val.trim();
        }
        if (Array.isArray(val) && val.length) {
            return val.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
        }
    }

    const sections = payload.Sections ?? payload.sections;
    if (sections && typeof sections === 'object') {
        if (Array.isArray(sections)) {
            return sections
                .map(sec => {
                    if (typeof sec === 'string') return sec;
                    const secTitle = sec.Title ?? sec.title ?? sec.Name ?? sec.name ?? '';
                    const lines = Array.isArray(sec.Entries ?? sec.entries ?? sec.Items ?? sec.items ?? sec.Lines ?? sec.lines)
                        ? (sec.Entries ?? sec.entries ?? sec.Items ?? sec.items ?? sec.Lines ?? sec.lines)
                        : [];
                    const header = secTitle ? `=== ${secTitle} ===` : '';
                    const body = lines.map(l => (typeof l === 'string' ? l : (l.Text ?? l.text ?? ''))).filter(Boolean).join('\n');
                    return [header, body].filter(Boolean).join('\n');
                })
                .filter(Boolean)
                .join('\n\n');
        }

        const dictChunks = Object.entries(sections).map(([secTitle, lines]) => {
            const header = `=== ${secTitle} ===`;
            const body = Array.isArray(lines) ? lines.map(l => String(l)).join('\n') : String(lines ?? '');
            return [header, body].filter(Boolean).join('\n');
        });
        if (dictChunks.length) {
            return dictChunks.join('\n\n');
        }
    }

    return '';
}

function formatBlizzlikePatchNotesHtml(rawText) {
    if (!rawText) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const normalized = rawText.replace(/\r\n/g, '\n').trim();
    const lines = normalized.split('\n');

    const htmlParts = [];
    let listStack = [];

    const listStyleByDepth = [
        'list-disc pl-5 space-y-1.5 text-[14px] text-slate-200',
        'list-[circle] pl-5 mt-1.5 space-y-1 text-[13.5px] text-slate-300',
        'list-[square] pl-5 mt-1 space-y-1 text-[13px] text-slate-300'
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
        if (!listStack.length) {
            listStack.push({ indent: indentLevel, items: [{ indent: indentLevel, text, children: [] }] });
            return;
        }

        const top = listStack[listStack.length - 1];
        if (indentLevel > top.indent) {
            const parentItems = top.items;
            const lastParent = parentItems[parentItems.length - 1];
            const childItem = { indent: indentLevel, text, children: [] };
            if (lastParent) {
                lastParent.children.push(childItem);
                listStack.push({ indent: indentLevel, items: lastParent.children });
            } else {
                parentItems.push(childItem);
            }
        } else {
            while (listStack.length > 1 && indentLevel < listStack[listStack.length - 1].indent) {
                listStack.pop();
            }
            listStack[listStack.length - 1].items.push({ indent: indentLevel, text, children: [] });
        }
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
            const heroSplit = headingText.match(/^Heroes:\s*(.+)$/i);
            if (heroSplit) {
                htmlParts.push(
                    `<h3 class="text-xl font-bold text-white pt-6 pb-1 mt-4 border-t border-slate-800/80 tracking-tight">${escapeHtml(heroSplit[1].trim())}</h3>`
                );
            } else {
                htmlParts.push(
                    `<h2 class="text-2xl font-bold text-white pt-7 pb-1.5 mt-5 border-t border-slate-800 tracking-tight first:pt-1 first:mt-0 first:border-t-0">${escapeHtml(headingText)}</h2>`
                );
            }
            continue;
        }

        const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*$/);
        if (bracketMatch) {
            flushList();
            htmlParts.push(
                `<h4 class="text-base font-bold text-slate-100 pt-3 pb-0.5">${escapeHtml(bracketMatch[1].trim())}</h4>`
            );
            continue;
        }

        const bulletMatch = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (bulletMatch) {
            const spaces = bulletMatch[1].replace(/\t/g, '    ').length;
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

function formatBlizzLine(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(
        /^([A-Za-z0-9'’().\- /+\[\]]{2,50}):(\s|$)/,
        '<strong class="font-semibold text-white">$1:</strong>$2'
    );
    return safe;
}

function normalizeMasterEntry(item, sourceMeta, index) {
    if (!item || typeof item !== 'object' || shouldRemovePatch(item)) return null;

    const rawDate = item.IsoDate || item.isoDate || item.Date || item.date || item.liveDate || null;
    const ts = rawDate ? Date.parse(rawDate) : NaN;
    const validIso = !Number.isNaN(ts) ? new Date(ts).toISOString() : null;

    const id = String(
        item.Id ??
        item.id ??
        item.internalId ??
        `${sourceMeta.sourceEra}-${index + 1}`
    ).trim();

    const rawTitle = String(
        item.Title ??
        item.title ??
        item.patchName ??
        id
    ).trim();

    const feedType = inferFeedType(item, sourceMeta, rawTitle);
    const era = inferTrueEra(validIso, sourceMeta.sourceEra, rawTitle, id);
    const isArchive = !Number.isNaN(ts) && ts < ARCHIVE_CUTOFF_TS;

    const displayDate = validIso
        ? formatPatchDisplayDate(validIso)
        : (item.Date || item.date || 'Unknown Date');

    const displayTitle = formatBlizzDisplayTitle(rawTitle, displayDate, feedType, era);

    const rawLink = item.Link ?? item.link ?? item.officialLink ?? item.alternateLink ?? '';
    const link = isSafeUrl(rawLink) ? String(rawLink).trim() : DEFAULT_HOTS_URL;

    const patchVersion = String(item.PatchVersion ?? item.patchVersion ?? item.gameVersion ?? '').trim() || null;
    const fullVersion = String(item.FullVersion ?? item.fullVersion ?? '').trim() || null;
    const build = String(item.Build ?? item.build ?? item.liveBuild ?? '').trim() || null;
    const inlineNotes = extractPatchNotesText(item);
    const detailPath = resolveDetailPath(item, era);

    return {
        id,
        rawTitle,
        title: displayTitle,
        date: displayDate,
        listDate: validIso ? formatSidebarDate(validIso) : formatSidebarDate(rawDate),
        isoDate: validIso,
        feedType,
        era,
        isArchive,
        patchVersion,
        fullVersion,
        build,
        link,
        inlineNotes,
        detailPath
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

    const normalized = [];

    for (let i = 0; i < MASTER_SOURCES.length; i++) {
        const res = responses[i];
        const meta = MASTER_SOURCES[i];
        if (!res || !res.ok) continue;

        const data = await res.json();
        const rows = Array.isArray(data)
            ? data
            : (Array.isArray(data?.patches) ? data.patches : (Array.isArray(data?.items) ? data.items : []));

        rows.forEach((row, idx) => {
            const entry = normalizeMasterEntry(row, meta, idx);
            if (entry) normalized.push(entry);
        });
    }

    CACHED_MASTER_PATCHES = deduplicateAndSortPatches(normalized);
    return CACHED_MASTER_PATCHES;
}

async function fetchPatchDetailHtml(item) {
    if (PATCH_DETAIL_CACHE.has(item.id)) {
        return PATCH_DETAIL_CACHE.get(item.id);
    }

    if (item.inlineNotes) {
        const html = formatBlizzlikePatchNotesHtml(item.inlineNotes);
        PATCH_DETAIL_CACHE.set(item.id, html);
        return html;
    }

    if (item.detailPath) {
        try {
            const res = await fetch(item.detailPath);
            if (res.ok) {
                const rawBody = await res.text();
                if (rawBody.trim()) {
                    const notesText = item.detailPath.endsWith('.json')
                        ? extractPatchNotesText(JSON.parse(rawBody))
                        : extractPatchNotesText(rawBody);

                    if (notesText) {
                        const html = formatBlizzlikePatchNotesHtml(notesText);
                        PATCH_DETAIL_CACHE.set(item.id, html);
                        return html;
                    }
                }
            }
        } catch (err) {
            console.warn(`Failed to load patch detail ${item.detailPath}:`, err);
        }
    }

    const fallbackHtml = `<p class="text-slate-400">No patch note details found for <span class="font-mono text-slate-300">${escapeHtml(item.detailPath || item.id)}</span>.</p>`;
    PATCH_DETAIL_CACHE.set(item.id, fallbackHtml);
    return fallbackHtml;
}

function getFilterButtons() {
    return Array.from(document.querySelectorAll('[data-patch-filter]'));
}

function syncFilterButtonStates() {
    const buttons = getFilterButtons();
    buttons.forEach(btn => {
        const type = String(btn.getAttribute('data-patch-filter') || '').toLowerCase();
        const isActive = type === CURRENT_FILTER;

        btn.setAttribute('aria-pressed', String(isActive));
        btn.classList.remove(...ACTIVE_FILTER_CLASSES, ...INACTIVE_FILTER_CLASSES);
        btn.classList.add(...(isActive ? ACTIVE_FILTER_CLASSES : INACTIVE_FILTER_CLASSES));
    });
}

function setPatchFilter(filterType) {
    const normalized = ['all', 'live', 'ptr'].includes(String(filterType).toLowerCase())
        ? String(filterType).toLowerCase()
        : 'all';

    CURRENT_FILTER = normalized;
    syncFilterButtonStates();
    loadLivePatchNotes();
}

function initPatchFilterControls() {
    const buttons = getFilterButtons();
    buttons.forEach(btn => {
        if (btn.dataset.patchFilterBound === 'true') return;
        btn.dataset.patchFilterBound = 'true';
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-patch-filter');
            setPatchFilter(type);
        });
    });
    syncFilterButtonStates();
}

window.switchPatchFilter = setPatchFilter;

async function loadLivePatchNotes() {
    initPatchFilterControls();

    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER)} Feed</h3>
        </div>
        <div class="text-xs text-slate-400 p-3">Loading patch notes...</div>
    `;

    schedulePatchSidebarSync();

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
                <div class="flex items-center justify-between px-2 pb-2">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER)} Feed</h3>
                    <span class="text-[10px] font-mono text-slate-500">0</span>
                </div>
                <div class="text-xs text-slate-400 p-3">No patches found in this feed.</div>
            `;
            const mainContent = document.getElementById('patch-main-content');
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-6 text-slate-400 text-sm">No patch notes available.</div>`;
            }
            schedulePatchSidebarSync();
            return;
        }

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.warn('Failed to load patch notes:', err);
        ACTIVE_PATCH_ITEMS = [
            {
                id: 'fallback-feed',
                title: 'Heroes of the Storm Live Patch Notes',
                date: 'Recent',
                listDate: 'Recent',
                feedType: 'live',
                era: 'live',
                isArchive: false,
                link: DEFAULT_HOTS_URL,
                inlineNotes: 'Patch feeds are syncing. Please check back shortly.'
            }
        ];
        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);
    }
}

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    syncFilterButtonStates();

    const headerTitle = CURRENT_FILTER === 'all'
        ? 'ALL FEED'
        : `${CURRENT_FILTER.toUpperCase()} FEED`;

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(headerTitle)}</h3>
            <span class="text-[11px] font-mono text-slate-500">${items.length}</span>
        </div>
    `;

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-${CSS.escape(item.id)}`;
        btn.className = 'w-full text-left p-3.5 rounded-xl border border-slate-800/90 bg-slate-950/50 hover:bg-slate-800/70 hover:border-slate-700 transition space-y-2 group';
        btn.addEventListener('click', () => selectPatchItem(item.id));

        const feedBadge = item.feedType === 'ptr'
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30">PTR</span>`
            : `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30">LIVE</span>`;

        const eraPill = (item.era === 'alpha' || item.era === 'beta')
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold text-purple-300 bg-purple-500/15 border border-purple-500/30 uppercase">${escapeHtml(item.era)}</span>`
            : '';

        const versionPill = item.patchVersion
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-300 bg-slate-900 border border-slate-700/80">${escapeHtml(item.patchVersion)}</span>`
            : '';

        btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-slate-400">${escapeHtml(item.listDate || item.date)}</span>
                <div class="flex items-center gap-1 shrink-0">
                    ${eraPill}
                    ${versionPill}
                    ${feedBadge}
                </div>
            </div>
            <h4 class="text-sm font-bold text-slate-100 group-hover:text-white leading-snug">${escapeHtml(item.title)}</h4>
        `;
        listContainer.appendChild(btn);
    });

    schedulePatchSidebarSync();
}

async function selectPatchItem(id) {
    const item = ACTIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    document.querySelectorAll('#patch-sidebar-list button[id^="btn-"]').forEach(b => {
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

    const metaParts = [
        item.era ? `Era <span class="text-slate-200 font-semibold uppercase">${escapeHtml(item.era)}</span>` : null,
        item.patchVersion ? `Patch <span class="text-slate-200 font-semibold">${escapeHtml(item.patchVersion)}</span>` : null,
        item.fullVersion ? `Version <span class="text-slate-200 font-semibold">${escapeHtml(item.fullVersion)}</span>` : null,
        item.build ? `Build <span class="text-slate-200 font-semibold">${escapeHtml(item.build)}</span>` : null
    ].filter(Boolean);

    mainContent.innerHTML = `
        <article class="space-y-6">
            <header class="border-b border-slate-800 pb-4 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-mono text-sky-400">${escapeHtml(item.date)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase ${item.feedType === 'ptr' ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30' : 'text-sky-300 bg-sky-500/15 border border-sky-500/30'}">${escapeHtml(item.feedType)}</span>
                    ${item.isArchive ? `<span class="text-[10px] px-2 py-0.5 rounded font-mono uppercase text-slate-300 bg-slate-800 border border-slate-700">Archive</span>` : ''}
                </div>
                <h2 class="text-3xl font-bold text-white tracking-tight">${escapeHtml(item.title)}</h2>
                ${metaParts.length ? `<div class="text-xs font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">${metaParts.join('<span>·</span>')}</div>` : ''}
            </header>

            <div id="patch-notes-body" class="space-y-2">
                <div class="text-xs text-slate-400 py-2">Loading patch notes...</div>
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

    schedulePatchSidebarSync();
}

// ==========================================
// PATCH SIDEBAR BURGER-SQUISH CONTROLLER
// ==========================================

let patchSidebarRafId = null;

function resetPatchSidebarLayout() {
    const col = document.getElementById('patch-sidebar-column');
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (col) {
        col.style.minHeight = '';
    }
    if (box) {
        box.style.position = '';
        box.style.top = '';
        box.style.left = '';
        box.style.width = '';
        box.style.height = '';
        box.style.maxHeight = '';
    }
}

function syncPatchSidebarBurger() {
    patchSidebarRafId = null;

    const view = document.getElementById('view-patchnotes');
    const col = document.getElementById('patch-sidebar-column');
    const box = document.getElementById('patch-sidebar-sticky-box');
    if (!view || !col || !box) return;

    const isVisible = !view.classList.contains('hidden') && view.offsetParent !== null;
    const isDesktop = window.innerWidth >= 1024;

    if (!isVisible || !isDesktop) {
        resetPatchSidebarLayout();
        return;
    }

    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const TOP_GAP = 16;
    const BOTTOM_FOOTER_GAP = 4;

    const headerBottom = header
        ? Math.round(header.getBoundingClientRect().bottom) + TOP_GAP
        : 76 + TOP_GAP;

    const footerTop = footer
        ? Math.round(footer.getBoundingClientRect().top)
        : window.innerHeight;

    const colRect = col.getBoundingClientRect();
    const naturalTop = Math.round(colRect.top);
    const naturalLeft = Math.round(colRect.left);
    const naturalWidth = Math.round(colRect.width);

    const lockedTop = Math.max(naturalTop, headerBottom);

    // Default height fills down to TOP_GAP from viewport bottom; squishes right above footer when footer enters view
    const defaultBottom = window.innerHeight - TOP_GAP;
    const footerClampedBottom = footerTop - BOTTOM_FOOTER_GAP;
    const bottomEdge = footerTop < window.innerHeight
        ? Math.min(defaultBottom, footerClampedBottom)
        : defaultBottom;

    const nextHeight = Math.max(180, bottomEdge - lockedTop);

    box.style.position = 'fixed';
    box.style.top = `${lockedTop}px`;
    box.style.left = `${naturalLeft}px`;
    box.style.width = `${naturalWidth}px`;
    box.style.height = `${nextHeight}px`;
    box.style.maxHeight = `${nextHeight}px`;
}

function schedulePatchSidebarSync() {
    if (patchSidebarRafId !== null) return;
    patchSidebarRafId = window.requestAnimationFrame(syncPatchSidebarBurger);
}

window.addEventListener('scroll', schedulePatchSidebarSync, { passive: true });
window.addEventListener('resize', schedulePatchSidebarSync, { passive: true });

const patchViewEl = document.getElementById('view-patchnotes');
if (patchViewEl && typeof MutationObserver !== 'undefined') {
    const patchViewObserver = new MutationObserver(schedulePatchSidebarSync);
    patchViewObserver.observe(patchViewEl, { attributes: true, attributeFilter: ['class', 'style'] });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPatchFilterControls();
        schedulePatchSidebarSync();
    }, { once: true });
} else {
    initPatchFilterControls();
    schedulePatchSidebarSync();
}
