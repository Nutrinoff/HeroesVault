// ============================================
// 1. PATCH REPOSITORY, CACHING & NORMALIZATION
// ============================================

let CACHED_MASTER_PATCHES = null;
let MASTER_PATCHES_INFLIGHT = null;
const PATCH_RAW_NOTES_CACHE = new Map();
const PATCH_RAW_NOTES_INFLIGHT = new Map();
const PATCH_DETAIL_CACHE = new Map();
const PATCH_DETAIL_INFLIGHT = new Map();

const PATCH_DATA_DIR = './data/patchnotes';
const DEFAULT_PATCH_API_BASE = 'https://s-st-01.anteater-bushmaster.ts.net';

function resolvePatchApiBase() {
    const base = (typeof window !== 'undefined' && typeof window.HEROESVAULT_API_BASE === 'string' && window.HEROESVAULT_API_BASE.trim())
        ? window.HEROESVAULT_API_BASE
        : ((typeof HEROESVAULT_API_BASE === 'string' && HEROESVAULT_API_BASE.trim())
            ? HEROESVAULT_API_BASE
            : DEFAULT_PATCH_API_BASE);
    return String(base || '').trim().replace(/\/+$/, '');
}

const PATCH_API_BASE = resolvePatchApiBase();
const DEFAULT_HOTS_URL = 'https://news.blizzard.com/en-us/heroes-of-the-storm';

// Technical Alpha ended Jan 12, 2015; Closed/Open Beta ran Jan 13 – Jun 1, 2015; Live started Jun 2, 2015
const ALPHA_CUTOFF_TS = Date.parse('2015-01-13T00:00:00Z');
const BETA_CUTOFF_TS = Date.parse('2015-06-02T00:00:00Z');
const ARCHIVE_CUTOFF_TS = Date.parse('2022-01-01T00:00:00Z');

const MASTER_SOURCES = [
    { file: 'alpha-master.json', defaultFeed: 'live', sourceEra: 'alpha' },
    { file: 'beta-master.json',  defaultFeed: 'live', sourceEra: 'beta' },
    { file: 'live-master.json',  defaultFeed: 'live', sourceEra: 'live' },
    { file: 'ptr-master.json',   defaultFeed: 'ptr',  sourceEra: 'ptr' }
];

function safeUrlCheck(rawUrl) {
    if (typeof isSafeUrl === 'function') {
        return Boolean(isSafeUrl(rawUrl));
    }
    const clean = String(rawUrl || '').trim();
    if (!clean) return false;
    try {
        const parsed = new URL(clean, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function safeHtmlEscape(value) {
    if (typeof escapeHtml === 'function') {
        return escapeHtml(value);
    }
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getPatchCacheKey(item) {
    const feed = String(item?.feedType || 'live').trim().toLowerCase();
    const id = String(item?.id || '').trim().toLowerCase();
    const detailPath = String(item?.detailPath || '').trim().toLowerCase();
    const isoDate = String(item?.isoDate || '').trim().toLowerCase();
    const build = String(item?.build || '').trim().toLowerCase();
    return `${feed}:${id}|${detailPath}|${isoDate}|${build}`;
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

function inferTrueEra(item, validIso, sourceEra, title, id) {
    const explicitEra = String(item?.Era ?? item?.era ?? '').trim().toLowerCase();
    const combined = `${title} ${id}`.toLowerCase();
    const ts = validIso ? Date.parse(validIso) : NaN;

    if (['alpha', 'beta', 'live', 'ptr'].includes(explicitEra)) {
        if (explicitEra === 'ptr') return 'ptr';
        if (!Number.isNaN(ts)) {
            if (ts < ALPHA_CUTOFF_TS) return 'alpha';
            if (ts < BETA_CUTOFF_TS) return 'beta';
            return 'live';
        }
        return explicitEra;
    }

    if (!Number.isNaN(ts)) {
        if (ts < ALPHA_CUTOFF_TS) return 'alpha';
        if (ts < BETA_CUTOFF_TS) return 'beta';
        if (sourceEra === 'ptr' || /\bptr\b/.test(combined)) return 'ptr';
        return 'live';
    }

    if (sourceEra === 'ptr' || /\bptr\b/.test(combined)) return 'ptr';
    return sourceEra || 'live';
}

function inferFeedType(item, sourceMeta, title) {
    const rawFeed = String(item.FeedType ?? item.feedType ?? '').trim().toLowerCase();
    const combined = `${item.patchType || ''} ${title}`.toLowerCase();

    if (rawFeed === 'ptr' || /\bptr\b/.test(combined) || combined.includes('public test')) return 'ptr';
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

function toDetailApiSubpath(detailPath) {
    if (!detailPath) return null;
    const cleaned = String(detailPath)
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/^data\/patchnotes\//, '')
        .replace(/^patchnotes\//, '');
    if (!cleaned) return null;
    return cleaned.split('/').map(encodeURIComponent).join('/');
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
                    const header = secTitle ? `== ${secTitle} ==` : '';
                    const body = lines.map(l => (typeof l === 'string' ? l : (l.Text ?? l.text ?? ''))).filter(Boolean).join('\n');
                    return [header, body].filter(Boolean).join('\n');
                })
                .filter(Boolean)
                .join('\n\n');
        }

        const dictChunks = Object.entries(sections).map(([secTitle, lines]) => {
            const header = `== ${secTitle} ==`;
            const body = Array.isArray(lines) ? lines.map(l => String(l)).join('\n') : String(lines ?? '');
            return [header, body].filter(Boolean).join('\n');
        });
        if (dictChunks.length) {
            return dictChunks.join('\n\n');
        }
    }

    return '';
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
    const era = inferTrueEra(item, validIso, sourceMeta.sourceEra, rawTitle, id);
    const isArchive = !Number.isNaN(ts) && ts < ARCHIVE_CUTOFF_TS;

    const displayDate = validIso
        ? formatPatchDisplayDate(validIso)
        : (item.Date || item.date || 'Unknown Date');

    const displayTitle = formatBlizzDisplayTitle(rawTitle, displayDate, feedType, era);

    const rawLink = item.Link ?? item.link ?? item.officialLink ?? item.alternateLink ?? '';
    const link = safeUrlCheck(rawLink) ? String(rawLink).trim() : DEFAULT_HOTS_URL;

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
        if (!item) continue;
        const key = getPatchCacheKey(item);
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

async function fetchMasterFeedJson(file) {
    const apiBase = PATCH_API_BASE || resolvePatchApiBase();
    if (apiBase) {
        try {
            const remoteRes = await fetch(`${apiBase}/api/patchnotes/${encodeURIComponent(file)}`);
            if (remoteRes.ok) {
                return await remoteRes.json();
            }
        } catch (err) {
            console.warn(`Remote patch feed failed for ${file}, falling back to local:`, err);
        }
    }

    try {
        const localRes = await fetch(`${PATCH_DATA_DIR}/${file}`);
        if (!localRes.ok) return null;
        return await localRes.json();
    } catch (err) {
        console.warn(`Invalid or missing patch feed ${file}:`, err);
        return null;
    }
}

async function fetchAllMasterPatches() {
    if (Array.isArray(CACHED_MASTER_PATCHES)) {
        return CACHED_MASTER_PATCHES;
    }

    if (MASTER_PATCHES_INFLIGHT) {
        return MASTER_PATCHES_INFLIGHT;
    }

    MASTER_PATCHES_INFLIGHT = (async () => {
        try {
            const payloads = await Promise.all(
                MASTER_SOURCES.map(src => fetchMasterFeedJson(src.file))
            );

            const normalized = [];

            for (let i = 0; i < MASTER_SOURCES.length; i++) {
                const data = payloads[i];
                const meta = MASTER_SOURCES[i];
                if (!data) continue;

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
        } finally {
            MASTER_PATCHES_INFLIGHT = null;
        }
    })();

    return MASTER_PATCHES_INFLIGHT;
}

async function fetchPatchRawNotesText(item) {
    if (!item) return '';
    if (item.inlineNotes) return item.inlineNotes;

    const cacheKey = getPatchCacheKey(item);
    if (PATCH_RAW_NOTES_CACHE.has(cacheKey)) {
        return PATCH_RAW_NOTES_CACHE.get(cacheKey);
    }

    if (PATCH_RAW_NOTES_INFLIGHT.has(cacheKey)) {
        return PATCH_RAW_NOTES_INFLIGHT.get(cacheKey);
    }

    const loadPromise = (async () => {
        let notesText = '';
        const subPath = toDetailApiSubpath(item.detailPath);
        const apiBase = PATCH_API_BASE || resolvePatchApiBase();

        if (apiBase && subPath) {
            try {
                const apiRes = await fetch(`${apiBase}/api/patchnotes/detail/${subPath}`);
                if (apiRes.ok) {
                    const rawBody = await apiRes.text();
                    if (rawBody.trim()) {
                        notesText = extractPatchNotesText(rawBody);
                    }
                }
            } catch (err) {
                console.warn(`Remote patch detail failed for ${subPath}, falling back to local:`, err);
            }
        }

        if (!notesText && item.detailPath) {
            try {
                const res = await fetch(item.detailPath);
                if (res.ok) {
                    const rawBody = await res.text();
                    if (rawBody.trim()) {
                        notesText = item.detailPath.endsWith('.json')
                            ? extractPatchNotesText(JSON.parse(rawBody))
                            : extractPatchNotesText(rawBody);
                    }
                }
            } catch (err) {
                console.warn(`Failed to load patch detail ${item.detailPath}:`, err);
            }
        }

        if (notesText) {
            PATCH_RAW_NOTES_CACHE.set(cacheKey, notesText);
        }
        return notesText;
    })().finally(() => {
        if (PATCH_RAW_NOTES_INFLIGHT.get(cacheKey) === loadPromise) {
            PATCH_RAW_NOTES_INFLIGHT.delete(cacheKey);
        }
    });

    PATCH_RAW_NOTES_INFLIGHT.set(cacheKey, loadPromise);
    return loadPromise;
}

async function fetchPatchDetailHtml(item) {
    if (!item) return '';

    const cacheKey = getPatchCacheKey(item);
    if (PATCH_DETAIL_CACHE.has(cacheKey)) {
        return PATCH_DETAIL_CACHE.get(cacheKey);
    }

    if (PATCH_DETAIL_INFLIGHT.has(cacheKey)) {
        return PATCH_DETAIL_INFLIGHT.get(cacheKey);
    }

    const renderPromise = (async () => {
        const notesText = await fetchPatchRawNotesText(item);
        if (notesText && typeof formatBlizzlikePatchNotesHtml === 'function') {
            const html = formatBlizzlikePatchNotesHtml(notesText);
            PATCH_DETAIL_CACHE.set(cacheKey, html);
            return html;
        }

        return `<p class="text-slate-400">No patch note details found for <span class="font-mono text-slate-300">${safeHtmlEscape(item.detailPath || item.id)}</span>.</p>`;
    })().finally(() => {
        if (PATCH_DETAIL_INFLIGHT.get(cacheKey) === renderPromise) {
            PATCH_DETAIL_INFLIGHT.delete(cacheKey);
        }
    });

    PATCH_DETAIL_INFLIGHT.set(cacheKey, renderPromise);
    return renderPromise;
}
