// ==========================================
// PATCH NOTES LIVE RSS MODULE
// ==========================================

let LIVE_PATCH_ITEMS = [];

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    const mainContent = document.getElementById('patch-main-content');
    if (!listContainer) return;

    if (LIVE_PATCH_ITEMS.length > 0) {
        renderPatchSidebar(LIVE_PATCH_ITEMS);
        return;
    }

    listContainer.innerHTML = '<h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Blizzard Feed</h3><div class="text-xs text-sky-400 p-3 animate-pulse">Fetching live RSS feed...</div>';

    try {
        const feedUrl = 'https://news.blizzard.com/en-us/feed/heroes-of-the-storm';
        // Using allorigins proxy to securely fetch the raw RSS XML data around browser CORS constraints
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Failed to reach RSS feed endpoint');
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const nodes = xmlDoc.querySelectorAll('item');
        LIVE_PATCH_ITEMS = Array.from(nodes).map((node, index) => ({
            id: `rss-item-${index}`,
            title: node.querySelector('title')?.textContent || 'Untitled Update',
            date: new Date(node.querySelector('pubDate')?.textContent || Date.now()).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }),
            link: node.querySelector('link')?.textContent || feedUrl,
            description: node.querySelector('description')?.textContent || 'No description provided in this feed entry.'
        }));

        if (LIVE_PATCH_ITEMS.length === 0) {
            throw new Error('No items found in XML document');
        }

        renderPatchSidebar(LIVE_PATCH_ITEMS);
        selectPatchItem(LIVE_PATCH_ITEMS[0].id);

    } catch (err) {
        console.error('RSS Feed fetch error:', err);
        listContainer.innerHTML = `
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Blizzard Feed</h3>
            <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-2">
                <p>Live feed blocked or unreachable due to strict browser CORS boundaries.</p>
                <a href="https://news.blizzard.com/en-us/feed/heroes-of-the-storm" target="_blank" class="text-sky-400 underline block font-semibold">Open RSS Source Directly →</a>
            </div>
        `;
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="space-y-4">
                    <h2 class="text-2xl font-bold text-white">Feed Connection Notice</h2>
                    <p class="text-xs text-slate-300">The browser prevented direct script execution of the live RSS stream. You can view the live feed XML or Blizzard News portal directly using the link below.</p>
                    <a href="https://news.blizzard.com/en-us/heroes-of-the-storm" target="_blank" class="inline-flex items-center gap-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2.5 rounded-xl border border-sky-500/40 text-xs font-bold transition">
                        Visit Blizzard News <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
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

function selectPatchItem(id) {
    const item = LIVE_PATCH_ITEMS.find(x => x.id === id);
    if (!item) return;

    document.querySelectorAll('#patch-sidebar-list button').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });
    document.getElementById(`btn-${id}`)?.classList.add('bg-sky-500/15', 'border-sky-500/70');

    const mainContent = document.getElementById('patch-main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="space-y-4">
            <div class="border-b border-slate-800 pb-4 space-y-1">
                <span class="text-xs font-mono text-sky-400">${item.date}</span>
                <h2 class="text-2xl font-bold text-white">${item.title}</h2>
            </div>
            
            <div class="text-sm text-slate-300 leading-relaxed space-y-3 prose prose-invert">
                ${item.description}
            </div>

            <div class="pt-4 border-t border-slate-800 flex justify-end">
                <a href="${item.link}" target="_blank" class="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 px-4 py-2 rounded-xl border border-sky-500/40 text-xs font-bold flex items-center gap-2 transition">
                    View Full Article on Blizzard <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}
