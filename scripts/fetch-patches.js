const fs = require('fs');
const path = require('path');

async function updatePatchFiles() {
    const dir = path.join(__dirname, '../data');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        console.log('Fetching live Heroes of the Storm news from Blizzard API...');
        const url = 'https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds[]=heroes-of-the-storm';
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        // Blizzard returns an object containing an articles array
        const articles = data.articles || data.items || [];
        console.log(`Fetched ${articles.length} articles from Blizzard API.`);

        const livePatches = [];
        const ptrPatches = [];

        articles.forEach((art, index) => {
            const title = art.title || art.heading || 'Untitled Update';
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
                link: art.url || art.link ? (art.url.startsWith('http') ? art.url : `https://news.blizzard.com${art.url}`) : 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                description: art.summary || art.description || '<p class="text-slate-300">Check out the official Blizzard news page for full details.</p>'
            };

            if (formattedItem.feedType === 'ptr') {
                ptrPatches.push(formattedItem);
            } else {
                livePatches.push(formattedItem);
            }
        });

        fs.writeFileSync(path.join(dir, 'live-patches.json'), JSON.stringify(livePatches, null, 2));
        fs.writeFileSync(path.join(dir, 'ptr-patches.json'), JSON.stringify(ptrPatches, null, 2));

        console.log(`Successfully saved ${livePatches.length} live patches and ${ptrPatches.length} PTR patches.`);
    } catch (err) {
        console.error('Failed to fetch real patches from Blizzard API:', err);
        process.exit(1);
    }
}

updatePatchFiles();
