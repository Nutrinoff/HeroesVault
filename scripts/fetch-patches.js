const fs = require('fs');
const path = require('path');

const API_URL = 'https://blizztrack.com/api/forums/heroes';

function extractEntries(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    for (const key of ['posts', 'threads', 'topics', 'items', 'articles', 'data', 'results']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

function parseDate(raw) {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(dateObj) {
    if (!dateObj) return 'Unknown Date';
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function normalizeEntry(item, index) {
    const title = String(
        item.title || item.subject || item.topicTitle || item.name || ''
    ).trim();

    if (!title) return null;

    const rawDate =
        item.createdAt ||
        item.publishedAt ||
        item.postedAt ||
        item.date ||
        item.timestamp ||
        item.created_at ||
        null;

    const dateObj = parseDate(rawDate);
    const lowerTitle = title.toLowerCase();
    const feedType = lowerTitle.includes('ptr') ? 'ptr' : 'live';

    const rawLink =
        item.url ||
        item.link ||
        item.threadUrl ||
        item.postUrl ||
        'https://blizztrack.com/forums?game=heroes';

    const link = String(rawLink).startsWith('http')
        ? String(rawLink)
        : `https://blizztrack.com${String(rawLink).startsWith('/') ? '' : '/'}${rawLink}`;

    const rawSummary =
        item.excerpt ||
        item.summary ||
        item.body ||
        item.content ||
        item.description ||
        '';

    const cleanSummary = String(rawSummary).trim() ||
        'View the full update details via the source link.';

    return {
        id: item.id ? String(item.id) : `${feedType}-${index}-${dateObj ? dateObj.getTime() : index}`,
        title,
        date: formatDisplayDate(dateObj),
        isoDate: dateObj ? dateObj.toISOString() : null,
        feedType,
        link,
        description: `<p class="text-slate-300">${cleanSummary}</p>`
    };
}

async function updatePatchFiles() {
    const outDir = path.join(__dirname, '../data');
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`Fetching Heroes of the Storm forum data from ${API_URL}...`);

    const response = await fetch(API_URL, {
        headers: {
            'User-Agent': 'HeroesVault-PatchFetcher/1.0 (+https://github.com/Nutrinoff/HeroesVault)',
            'Accept': 'application/json'
        }
    });

    console.log(`HTTP Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
        const bodySnippet = (await response.text()).slice(0, 400);
        throw new Error(`Request failed (${response.status}): ${bodySnippet}`);
    }

    const rawText = await response.text();
    let json;
    try {
        json = JSON.parse(rawText);
    } catch {
        throw new Error(`Expected JSON from BlizzTrack API, got: ${rawText.slice(0, 400)}`);
    }

    const rawEntries = extractEntries(json);
    console.log(`Raw entries count: ${rawEntries.length}`);
    if (rawEntries.length > 0) {
        console.log('Sample entry keys:', Object.keys(rawEntries[0]));
    }

    const normalized = rawEntries
        .map((item, idx) => normalizeEntry(item, idx))
        .filter(Boolean)
        .filter((entry) => {
            const t = entry.title.toLowerCase();
            return t.includes('patch notes') || t.includes('balance patch') || t.includes('ptr');
        })
        .sort((a, b) => {
            const timeA = a.isoDate ? new Date(a.isoDate).getTime() : 0;
            const timeB = b.isoDate ? new Date(b.isoDate).getTime() : 0;
            return timeB - timeA;
        });

    const livePatches = normalized.filter((item) => item.feedType === 'live');
    const ptrPatches = normalized.filter((item) => item.feedType === 'ptr');

    if (livePatches.length === 0 && ptrPatches.length === 0) {
        throw new Error(
            `Parsed ${normalized.length} matching patch entries out of ${rawEntries.length} raw entries. ` +
            `Payload preview: ${rawText.slice(0, 400)}`
        );
    }

    fs.writeFileSync(path.join(outDir, 'live-patches.json'), `${JSON.stringify(livePatches, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'ptr-patches.json'), `${JSON.stringify(ptrPatches, null, 2)}\n`);

    console.log(`Wrote ${livePatches.length} live patches and ${ptrPatches.length} PTR patches.`);
}

updatePatchFiles().catch((err) => {
    console.error('Patch fetch failed:', err);
    process.exit(1);
});
