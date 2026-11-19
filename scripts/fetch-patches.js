const fs = require('fs');
const path = require('path');

async function updatePatchFiles() {
    try {
        console.log('Fetching official Blizzard news feed...');
        const response = await fetch('https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds[]=heroes-of-the-storm');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const articles = data.articles || data.items || [];

        const livePatches = [];
        const ptrPatches = [];

        articles.forEach((art, index) => {
            const title = art.title || '';
            const lowerTitle = title.toLowerCase();

            // Format article object cleanly
            const formattedItem = {
                id: `patch-${index}-${Date.now()}`,
                title: title,
                date: art.publishedDate ? new Date(art.publishedDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) : 'Recent Update',
                link: art.url || art.link || 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                description: art.summary || art.description || 'Check out the official Blizzard news page for full details.'
            };

            // Filter cleanly based on title keywords
            if (lowerTitle.includes('ptr patch notes')) {
                ptrPatches.push(formattedItem);
            } else if (lowerTitle.includes('live patch notes') || lowerTitle.includes('balance patch notes') || lowerTitle.includes('has joined heroes')) {
                livePatches.push(formattedItem);
            }
        });

        const dir = path.join(__dirname, '../data');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Save separate JSON files
        fs.writeFileSync(path.join(dir, 'live-patches.json'), JSON.stringify(livePatches, null, 2));
        fs.writeFileSync(path.join(dir, 'ptr-patches.json'), JSON.stringify(ptrPatches, null, 2));

        console.log(`Successfully saved ${livePatches.length} live patches and ${ptrPatches.length} PTR patches.`);
    } catch (err) {
        console.error('Failed to fetch and parse patches:', err);
        process.exit(1);
    }
}

updatePatchFiles();
