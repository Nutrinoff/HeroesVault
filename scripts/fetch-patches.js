const fs = require('fs');
const path = require('path');

const API_URL = 'https://blizztrack.com/api/forums/heroes';

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function stripTags(html) {
    return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTitle(post) {
    const direct = String(post.title || '').trim();
    if (direct) return direct;

    const plain = stripTags(post.excerpt || '');
    const bracketMatch = plain.match(/\[([^\]]+)\]/);
    if (bracketMatch && bracketMatch[1].trim()) {
        return bracketMatch[1].trim();
    }

    return plain.slice(0, 140).trim();
}

function extractLink(post) {
    const direct = post.url || post.link;
    if (direct) {
        return String(direct).startsWith('http')
            ? String(direct)
            : `https://blizztrack.com${String(direct).startsWith('/') ? '' : '/'}${direct}`;
    }

    const excerpt = String(post.excerpt || '');
    const hrefMatch = excerpt.match(/href=["'](https?:\/\/[^"']+)["']/i);
    if (hrefMatch) {
        return decodeEntities(hrefMatch[1]);
    }

    return 'https://blizztrack.com/forums?game=heroes';
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

function normalizePost(post, index) {
    const title = extractTitle(post);
    if (!title) return null;

    const dateObj = parseDate(post.posted_on || post.created_at || post.date);
    const lowerTitle = title.toLowerCase();
    const feedType = lowerTitle.includes('ptr') ? 'ptr' : 'live';
    const link = extractLink(post);

    const plainExcerpt = stripTags(post.excerpt || '');
    const summary = plainExcerpt || 'View the full update details on Blizzard News.';

    return {
        id: post.id ? String(post.id) : `${feedType}-${index}-${dateObj ? dateObj.getTime() : index}`,
        title,
        date: formatDisplayDate(dateObj),
        isoDate: dateObj ? dateObj.toISOString() : null,
        feedType,
        link,
        description: `<p class="text-slate-300">${summary}</p>`
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
    const json = JSON.parse(rawText);
    const rawPosts = Array.isArray(json?.result?.posts) ? json.result.posts : [];

    console.log(`Raw posts count: ${rawPosts.length}`);

    const normalized = rawPosts
        .map((post, idx) => normalizePost(post, idx))
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
            `Found ${rawPosts.length} posts, 0 matched patch filter. Sample titles: ` +
            rawPosts.slice(0, 5).map(extractTitle).join(' | ')
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
