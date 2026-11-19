// ==========================================
// PATCH NOTES FULL ARTICLE SCRAPER MODULE
// ==========================================

let LIVE_PATCH_ITEMS = [];

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    if (LIVE_PATCH_ITEMS.length > 0) {
        renderPatchSidebar(LIVE_PATCH_ITEMS);
        return;
    }

    listContainer.innerHTML = '<h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Blizzard Feed</h3><div class="text-xs text-sky-400 p-3 animate-pulse">Loading updates...</div>';

    try {
        const apiUrl = 'https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds[]=heroes-of-the-storm';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Failed to reach news API endpoint');
        
        const wrapper = await response.json();
        const data = JSON.parse(wrapper.contents);
        
        const articles = data.articles || data.items || data;
        if (!Array.isArray(articles) || articles.length === 0) {
            throw new Error('No articles found in API response');
        }

        LIVE_PATCH_ITEMS = articles.map((art, index) => ({
            id: `patch-${index}`,
            title: art.title || 'Untitled Update',
            date: art.publishedDate ? new Date(art.publishedDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 'Recent Update',
            link: art.url || art.link || 'https://news.blizzard.com/en-us/heroes-of-the-storm',
            summary: art.summary || art.description || 'Click to view full patch notes details.'
        }));

        renderPatchSidebar(LIVE_PATCH_ITEMS);
        selectPatchItem(LIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.warn('API fetch error, using fallback items:', err);
        
        LIVE_PATCH_ITEMS = [
            {
                id: 'fallback-1',
                title: 'Heroes of the Storm Live Patch Notes',
                date: 'September 28, 2026',
                link: 'https://news.blizzard.com/en-us/heroes-of-the-storm',
                summary: 'New patch arrived with a new Hero, map updates, and balance changes across the Nexus rosters!'
            }
        ];

        renderPatchSidebar(LIVE_PATCH_ITEMS);
        selectPatchItem(LIVE_PATCH_ITEMS[0].id);
    }
}

function renderPatchSidebar(items) {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Blizzard Feed</h3>';

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.id = `btn-${item.id}`;
        btn.className = 'w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800/80 transition space-y-1';
        btn.onclick = () => selectPatchItem(item.id);
        
        btn.innerHTML = `
            <h4 class="text-xs font-bold text-slate-200 line-clamp-2">${item.title}</h4>
            <span class="text-[10px] font-mono text-sky-400">${item.date}</span>
        `;
        listContainer.appendChild(btn);
    });
}

async function selectPatchItem(id) {
    const item = LIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    document.querySelectorAll('#patch-sidebar-list button').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });
    document.getElementById(`btn-${id}`)?.classList.add('bg-sky-500/15', 'border-sky-500/70');

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    // Show initial header with summary while fetching full page content
    mainContent.innerHTML = `
        <div class="space-y-4">
            <div class="border-b border-slate-800 pb-4 space-y-1">
                <span class="text-xs font-mono text-sky-400">${item.date}</span>
                <h2 class="text-2xl font-bold text-white">${item.title}</h2>
            </div>
            
            <div id="article-body-container" class="text-sm text-slate-300 leading-relaxed space-y-3">
                <p>${item.summary}</p>
                <div class="text-xs text-sky-400 animate-pulse pt-2">Fetching full article details from Blizzard...</div>
            </div>

            <div class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${item.link}" target="_blank" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold flex items-center gap-2 transition">
                    Open Original on Blizzard <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Try to fetch the full article HTML and extract the main content container
    try {
        const articleProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(item.link)}`;
        const res = await fetch(articleProxyUrl);
        if (!res.ok) throw new Error('Failed to fetch full article page');
        
        const wrapper = await res.json();
        const parser = new DOMParser();
        const doc = parser.parseFromString(wrapper.contents, 'text/html');
        
        // Blizzard news pages usually store article bodies inside specific layout containers (like .Article-content or article)
        const articleBody = doc.querySelector('.Article-content') || doc.querySelector('article') || doc.querySelector('.detail-content');
        
        const bodyContainer = document.getElementById('article-body-container');
        if (bodyContainer && articleBody) {
            // Clean up unwanted styling or scripts from the scraped DOM
            articleBody.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
            bodyContainer.innerHTML = articleBody.innerHTML;
        } else if (bodyContainer) {
            bodyContainer.innerHTML = `<p>${item.summary}</p><p class="text-xs text-slate-500 italic mt-2">Full text layout couldn't be automatically extracted. Use the button below to read the complete article on Blizzard.</p>`;
        }
    } catch (e) {
        console.warn('Could not scrape full article body dynamically:', e);
    }
}
