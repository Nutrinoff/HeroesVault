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

function inferTrueEra(validIso, sourceEra, title, id) {
    const combined = `${title} ${id}`.toLowerCase();
    const ts = validIso ? Date.parse(validIso) : NaN;

    if (!Number.isNaN(ts)) {
        if (ts < ALPHA_CUTOFF_TS) return 'alpha';
        if (ts < BETA_CUTOFF_TS) return 'beta';
        // Post-2015 items are never Technical Alpha/Beta even if a JSON has a bad "alpha" tag
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
    const safeFolder = ['alpha', 'beta', 'live', 'ptr'].includes(era) ? era : 'live';
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
            candidates.push(`${PATCH_DATA_DIR}/${safeFolder}/${cleanExplicit}`);
        }
    }

    if (safeId) {
        candidates.push(`${PATCH_DATA_DIR}/${safeFolder}/${safeId}.json`);
        candidates.push(`${PATCH_DATA_DIR}/${safeFolder}/${safeId}.txt`);
    }

    return [...new Set(candidates)];
}

function extractPatchNotesText(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        // Avoid dumping raw JSON objects as plain text
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
        'patchNotes',
        'PatchNotes',
        'cleanedPatchNotes',
        'CleanedPatchNotes',
        'rawPatchNotes',
        'RawPatchNotes',
        'notes',
        'Notes',
        'body',
        'Body',
        'content',
        'Content'
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

    return '';
}

/**
 * Formats patch notes in a clean Blizzard-like hierarchy:
 * - Major headings (e.g. "=== Heroes ===" or "=== Heroes: Chromie ===")
 * - Subheadings (e.g. "[Updates]", "[Bug Fixes]", "Talents", "Base", "Level 1")
 * - Clean bulleted & sub-bulleted lists with bold lead-ins
 */
function formatBlizzlikePatchNotesHtml(rawText) {
    if (!rawText) {
        return `<p class="text-slate-400">No patch notes recorded for this build.</p>`;
    }

    const normalized = rawText.replace(/\r\n/g, '\n').trim();
    const lines = normalized.split('\n');

    const htmlParts = [];
    let listStack = []; // { indent: number, items: [{ text, children: [] }] }

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

        // Major section header: === General === or === Heroes: Chromie ===
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

        // Bracketed subgroup: [Updates], [Bug Fixes], [Releases]
        const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*$/);
        if (bracketMatch) {
            flushList();
            htmlParts.push(
                `<h4 class="text-base font-bold text-slate-100 pt-3 pb-0.5">${escapeHtml(bracketMatch[1].trim())}</h4>`
            );
            continue;
        }

        // Bullet line: "• ...", "- ...", "* ..."
        const bulletMatch = line.match(/^(\s*)(?:•|[-*])\s+(.*)$/);
        if (bulletMatch) {
            const spaces = bulletMatch[1].replace(/\t/g, '    ').length;
            const indentLevel = Math.floor(spaces / 2);
            addBullet(bulletMatch[2].trim(), indentLevel);
            continue;
        }

        // Standalone short subsection line (e.g. "Talents", "Base", "Level 1", "Deth Lazor [W]")
        const isStandaloneSubheading =
            trimmed.length <= 48 &&
            !/[.!?]$/.test(trimmed) &&
            !/\b(increased|reduced|decreased|added|removed|fixed|updated)\b/i.test(trimmed);

        if (isStandaloneSubheading) {
            flushList();
            htmlParts.push(
                `<h4 class="text-[15px] font-bold text-slate-100 pt-3 pb-0.5">${escapeHtml(trimmed)}</h4>`
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
    // Bold lead-in before a colon (e.g., "Cooldown:", "New Hero Released —")
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

    const title = String(
        item.Title ??
        item.title ??
        item.patchName ??
        id
    ).trim();

    const feedType = inferFeedType(item, sourceMeta, title);
    const era = inferTrueEra(validIso, sourceMeta.sourceEra, title, id);
    const isArchive = !Number.isNaN(ts) && ts < ARCHIVE_CUTOFF_TS;

    const rawLink = item.Link ?? item.link ?? item.officialLink ?? item.alternateLink ?? '';
    const link = isSafeUrl(rawLink) ? String(rawLink).trim() : DEFAULT_HOTS_URL;

    const patchVersion = String(item.PatchVersion ?? item.patchVersion ?? item.gameVersion ?? '').trim() || null;
    const fullVersion = String(item.FullVersion ?? item.fullVersion ?? '').trim() || null;
    const build = String(item.Build ?? item.build ?? item.liveBuild ?? '').trim() || null;
    const inlineNotes = extractPatchNotesText(item);

    return {
        id,
        title,
        date: item.Date || item.date || (validIso ? formatPatchDisplayDate(validIso) : 'Unknown Date'),
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

    for (const candidateUrl of item.detailPaths) {
        try {
            const res = await fetch(candidateUrl);
            if (!res.ok) continue;

            const rawBody = await res.text();
            if (!rawBody.trim()) continue;

            let notesText = '';
            if (candidateUrl.endsWith('.json')) {
                const parsed = JSON.parse(rawBody);
                notesText = extractPatchNotesText(parsed);
            } else {
                notesText = extractPatchNotesText(rawBody);
            }

            if (notesText) {
                const html = formatBlizzlikePatchNotesHtml(notesText);
                PATCH_DETAIL_CACHE.set(item.id, html);
                return html;
            }
        } catch {
            // Try next candidate path
        }
    }

    const fallbackHtml = `<p class="text-slate-400">No patch note details available yet for <span class="font-mono text-slate-300">${escapeHtml(item.id)}</span>.</p>`;
    PATCH_DETAIL_CACHE.set(item.id, fallbackHtml);
    return fallbackHtml;
}

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    renderPatchHeaderControls();

    listContainer.innerHTML = `
        <div class="flex items-center justify-between px-2 pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(CURRENT_FILTER)} Feed</h3>
        </div>
        <div class="text-xs text-slate-400 p-3">Loading patch notes...</div>
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
            return;
        }

        renderPatchSidebar(ACTIVE_PATCH_ITEMS);
        await selectPatchItem(ACTIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.warn('Failed to load patch notes:', err);
        ACTIVE_PATCH_ITEMS = [
            {
                id: 'fallback-feed',
                title: 'Heroes of the Storm Patch Notes',
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
        btn.onclick = () => selectPatchItem(item.id);

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
}
