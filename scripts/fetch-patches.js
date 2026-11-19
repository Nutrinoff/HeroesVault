const fs = require('fs');
const path = require('path');

async function updatePatchFiles() {
    const dir = path.join(__dirname, '../data');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        console.log('Fetching official Blizzard RSS feed for Heroes of the Storm...');
        const feedUrl = 'https://news.blizzard.com/en-us/feed/heroes-of-the-storm';
        
        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const xmlText = await response.text();
        console.log(`Fetched RSS feed successfully. Length: ${xmlText.length} bytes.`);

        // Simple and robust XML item extraction using regex
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        const articles = [];

        while ((match = itemRegex.exec(xmlText)) !== null) {
            const itemContent = match[1];

            const getTagValue = (tagName) => {
                const tagRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
                const tagMatch = itemContent.match(tagRegex);
                if (!tagMatch) return '';
                // Clean up CDATA if present
                return tagMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
            };

            const title = getTagValue('title');
            const link = getTagValue('link');
            const pubDate = getTagValue('pubDate');
            const description = getTagValue('description');

            if (title) {
                articles.push({
                    title,
                    link: link || 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                    publishedDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    summary: description || 'Click to view full patch notes on Blizzard.'
                });
            }
        }

        console.log(`Successfully parsed ${articles.length} articles from RSS feed.`);

        const livePatches = [];
        const ptrPatches = [];

        articles.forEach((art, index) => {
            const title = art.title;
            const lowerTitle = title.toLowerCase();

            const formattedItem = {
                id: `patch-${index}-${Date.now()}`,
                title: title,
                date: new Date(art.publishedDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                feedType: lowerTitle.includes('ptr') ? 'ptr' : 'live',
                link: art.link,
                description: `<div class="space-y-2"><p class="text-slate-300">${art.summary}</p></div>`
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
        console.error('Failed to fetch/parse RSS feed:', err);
        process.exit(1);
    }
}

updatePatchFiles();
