const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://blizztrack.com/api/forums/heroes';
const CATEGORIES_URL = 'https://blizztrack.com/api/forums/heroes/categories';

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

function extractPostsFromPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.result?.posts)) return payload.result.posts;
    for (const key of ['posts', 'threads', 'topics', 'items', 'articles', 'data', 'results']) {
        if (Array.isArray(payload[key])) return payload[key];
        if (Array.isArray(payload?.result?.[key])) return payload.result[key];
    }
    return [];
}

function normalizePost(post, index) {
    const title = extractTitle(post);
    if (!title) return null;

    const dateObj = parseDate(post.posted_on || post.publishedAt || post.created_at || post.date);
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

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'HeroesVault-PatchFetcher/1.0 (+https://github.com/Nutrinoff/HeroesVault)',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        return { ok: false, status: response.status, json: null };
    }

    const text = await response.text();
    try {
        return { ok: true, status: response.status, json: JSON.parse(text) };
    } catch {
        return { ok: false, status: response.status, json: null };
    }
}

function postSignature(post) {
    const raw = JSON.stringify({
        id: post.id,
        title: post.title,
        posted_on: post.posted_on,
        excerpt: post.excerpt,
        url: post.url || post.link
    });
    return raw;
}

async function fetchAllRawPosts() {
    const allPosts = [];
    const seenSignatures = new Set();

    function addPosts(posts) {
        let added = 0;
        for (const p of posts) {
            if (!p || typeof p !== 'object') continue;
            const sig = p.id != null ? `id:${p.id}` : `raw:${postSignature(p)}`;
            if (!seenSignatures.has(sig)) {
                seenSignatures.add(sig);
                allPosts.push(p);
                added++;
            }
        }
        return added;
    }

    // 1. Base endpoint
    const baseRes = await fetchJson(BASE_URL);
    console.log(`Base endpoint (${BASE_URL}) -> HTTP ${baseRes.status}`);
    if (!baseRes.ok || !baseRes.json) {
        throw new Error(`Base endpoint request failed with status ${baseRes.status}`);
    }

    const basePosts = extractPostsFromPayload(baseRes.json);
    addPosts(basePosts);
    console.log(`Base posts collected: ${allPosts.length}`);

    // 2. Try pagination query patterns (page & offset) up to a safe cap
    const maxPages = 15;
    let pagePaginationWorked = false;
    for (let page = 2; page <= maxPages; page++) {
        const candidates = [
            `${BASE_URL}?page=${page}&limit=100`,
            `${BASE_URL}?page=${page}`
        ];
        let foundNewOnPage = false;

        for (const candidate of candidates) {
            const res = await fetchJson(candidate);
            if (!res.ok || !res.json) continue;
            const posts = extractPostsFromPayload(res.json);
            if (posts.length === 0) continue;

            // Detect if server simply echoed the exact same base batch
            const newCount = addPosts(posts);
            if (newCount > 0) {
                pagePaginationWorked = true;
                foundNewOnPage = true;
                break;
            }
        }

        if (!foundNewOnPage) break;
    }

    if (!pagePaginationWorked) {
        // Also try offset-based pagination in case the API uses offset/skip
        const pageSize = basePosts.length || 25;
        for (let step = 1; step <= maxPages; step++) {
            const offset = step * pageSize;
            const res = await fetchJson(`${BASE_URL}?offset=${offset}&limit=100`);
            if (!res.ok || !res.json) break;
            const posts = extractPostsFromPayload(res.json);
            if (posts.length === 0 || addPosts(posts) === 0) break;
        }
    }

    // 3. Try querying available forum categories in case categories hold additional threads
    const catRes = await fetchJson(CATEGORIES_URL);
    if (catRes.ok && catRes.json) {
        const rawCats = Array.isArray(catRes.json)
            ? catRes.json
            : (Array.isArray(catRes.json?.result?.categories)
                ? catRes.json.result.categories
                : (Array.isArray(catRes.json?.result) ? catRes.json.result : []));

        const categoryIds = rawCats
            .map((c) => (typeof c === 'object' && c !== null ? (c.id ?? c.category_id ?? c.categoryId) : c))
            .filter((id) => id !== undefined && id !== null && String(id).trim() !== '');

        for (const catId of categoryIds.slice(0, 20)) {
            const catPostsRes = await fetchJson(`${BASE_URL}?category=${encodeURIComponent(catId)}`);
            if (catPostsRes.ok && catPostsRes.json) {
                addPosts(extractPostsFromPayload(catPostsRes.json));
            }
        }
    }

    return allPosts;
}

function readExistingPatches(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn(`Warning: Could not parse existing ${filePath}, starting fresh:`, err.message);
        return [];
    }
}

function entryKey(item) {
    if (item.link && item.link !== 'https://blizztrack.com/forums?game=heroes') {
        return `link:${item.link.trim().toLowerCase()}`;
    }
    return `id:${String(item.id).trim().toLowerCase()}`;
}

function mergeAndSortNewestFirst(existingList, fetchedList, fallbackFeedType) {
    const byKey = new Map();

    // Seed with existing items so historical entries and custom edits are retained
    for (const oldItem of existingList) {
        if (!oldItem || !oldItem.title) continue;
        const normalizedOld = {
            ...oldItem,
            feedType: oldItem.feedType || fallbackFeedType
        };
        byKey.set(entryKey(normalizedOld), normalizedOld);
    }

    // Merge fetched items: preserve any manually customized description on existing items
    for (const freshItem of fetchedList) {
        const key = entryKey(freshItem);
        const prev = byKey.get(key);

        if (prev) {
            const hasCustomDescription =
                prev.description &&
                prev.description !== freshItem.description &&
                prev.description.trim() !== '';

            byKey.set(key, {
                ...freshItem,
                id: prev.id || freshItem.id,
                description: hasCustomDescription ? prev.description : freshItem.description
            });
        } else {
            byKey.set(key, freshItem);
        }
    }

    return Array.from(byKey.values()).sort((a, b) => {
        const timeA = a.isoDate ? new Date(a.isoDate).getTime() : (parseDate(a.date)?.getTime() || 0);
        const timeB = b.isoDate ? new Date(b.isoDate).getTime() : (parseDate(b.date)?.getTime() || 0);
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id).localeCompare(String(a.id));
    });
}

async function updatePatchFiles() {
    const outDir = path.join(__dirname, '../data');
    fs.mkdirSync(outDir, { recursive: true });

    const livePath = path.join(outDir, 'live-patches.json');
    const ptrPath = path.join(outDir, 'ptr-patches.json');

    const existingLive = readExistingPatches(livePath);
    const existingPtr = readExistingPatches(ptrPath);

    const rawPosts = await fetchAllRawPosts();
    console.log(`Total unique raw posts collected: ${rawPosts.length}`);

    const fetchedNormalized = rawPosts
        .map((post, idx) => normalizePost(post, idx))
        .filter(Boolean)
        .filter((entry) => {
            const t = entry.title.toLowerCase();
            return t.includes('patch notes') || t.includes('balance patch') || t.includes('ptr');
        });

    const fetchedLive = fetchedNormalized.filter((item) => item.feedType === 'live');
    const fetchedPtr = fetchedNormalized.filter((item) => item.feedType === 'ptr');

    if (fetchedLive.length === 0 && fetchedPtr.length === 0 && existingLive.length === 0 && existingPtr.length === 0) {
        throw new Error(
            `Found ${rawPosts.length} posts, 0 matched patch filter. Sample titles: ` +
            rawPosts.slice(0, 5).map(extractTitle).join(' | ')
        );
    }

    const mergedLive = mergeAndSortNewestFirst(existingLive, fetchedLive, 'live');
    const mergedPtr = mergeAndSortNewestFirst(existingPtr, fetchedPtr, 'ptr');

    fs.writeFileSync(livePath, `${JSON.stringify(mergedLive, null, 2)}\n`);
    fs.writeFileSync(ptrPath, `${JSON.stringify(mergedPtr, null, 2)}\n`);

    console.log(
        `Saved ${mergedLive.length} live patches (${existingLive.length} prior + ${fetchedLive.length} fetched) ` +
        `and ${mergedPtr.length} PTR patches (${existingPtr.length} prior + ${fetchedPtr.length} fetched).`
    );
}

updatePatchFiles().catch((err) => {
    console.error('Patch fetch failed:', err);
    process.exit(1);
});
