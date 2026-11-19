const fs = require('fs');
const path = require('path');

const FALLBACK_LIVE = [
    {
        id: 'fallback-live-1',
        title: 'Heroes of the Storm Balance Patch Notes - September 28, 2026',
        date: 'September 28, 2026',
        feedType: 'live',
        link: 'https://news.blizzard.com/en-us/heroes-of-the-storm',
        description: '<p class="text-slate-300">Welcome to another balance update for the Nexus! This patch brings targeted adjustments to several heroes to fine-tune win rates and improve game balance across all battlegrounds.</p><p class="text-slate-300 mt-2">Check out full details on the official Blizzard page.</p>'
    }
];

const FALLBACK_PTR = [
    {
        id: 'fallback-ptr-1',
        title: 'Heroes of the Storm PTR Patch Notes - September 2026',
        date: 'September 15, 2026',
        feedType: 'ptr',
        link: 'https://news.blizzard.com/en-us/heroes-of-the-storm',
        description: '<p class="text-slate-300">Testing is live on the PTR! Dive in to preview upcoming changes, new talent adjustments, and general bug fixes before they hit the live servers.</p>'
    }
];

async function updatePatchFiles() {
    const dir = path.join(__dirname, '../data');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        console.log('Fetching official Blizzard news feed...');
        const response = await fetch('https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds[]=heroes-of-the-storm');
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const articles = data.articles || data.items || [];

        const livePatches = [];
        const ptrPatches = [];

        if (Array.isArray(articles) && articles.length > 0) {
            articles.forEach((art, index) => {
                const title = art.title || 'Heroes of the Storm Update';
                const lowerTitle = title.toLowerCase();

                const formattedItem = {
                    id: `patch-${index}-${Date.now()}`,
                    title: title,
                    date: art.publishedDate ? new Date(art.publishedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : 'Recent Update',
                    feedType: lowerTitle.includes('ptr') ? 'ptr' : 'live',
                    link: art.url || art.link || 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                    description: art.summary || art.description || '<p class="text-slate-300">Click below to read the full update details on the official Blizzard news site.</p>'
                };

                if (formattedItem.feedType === 'ptr') {
                    ptrPatches.push(formattedItem);
                } else {
                    livePatches.push(formattedItem);
                }
            });
        }

        // Use fallbacks if feed was empty
        const finalLive = livePatches.length > 0 ? livePatches : FALLBACK_LIVE;
        const finalPtr = ptrPatches.length > 0 ? ptrPatches : FALLBACK_PTR;

        fs.writeFileSync(path.join(dir, 'live-patches.json'), JSON.stringify(finalLive, null, 2));
        fs.writeFileSync(path.join(dir, 'ptr-patches.json'), JSON.stringify(finalPtr, null, 2));

        console.log(`Successfully saved ${finalLive.length} live patches and ${finalPtr.length} PTR patches.`);
    } catch (err) {
        console.warn('Failed to fetch from Blizzard API, writing fallback data:', err);
        
        fs.writeFileSync(path.join(dir, 'live-patches.json'), JSON.stringify(FALLBACK_LIVE, null, 2));
        fs.writeFileSync(path.join(dir, 'ptr-patches.json'), JSON.stringify(FALLBACK_PTR, null, 2));
    }
}

updatePatchFiles();
