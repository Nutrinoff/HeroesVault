// ==========================================
// PATCH NOTES LIVE FEED MODULE
// ==========================================

let LIVE_PATCH_ITEMS = [];

async function loadLivePatchNotes() {
    const listContainer = document.getElementById('patch-sidebar-list');
    if (!listContainer) return;

    if (LIVE_PATCH_ITEMS.length > 0) {
        renderPatchSidebar(LIVE_PATCH_ITEMS);
        return;
    }

    try {
        // Using AllOrigins CORS proxy to safely fetch Blizzard's community news feed or equivalent JSON mirror
        // Alternatively, we can parse Blizzard's official XML feed endpoint converted via an XML-to-JSON parser.
        const rssUrl = encodeURIComponent('https://news.blizzard.com/en-us/feed/heroes-of-the-storm');
        const proxyUrl = `https://api.allorigins.win/get?url=${rssUrl}`;
        
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('Network response failed');
        
        const data = await res.json();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.contents, 'text/xml');
        
        const items = xmlDoc.querySelectorAll('item');
        LIVE_PATCH_ITEMS = Array.from(items).map((item, index) => ({
            id: `patch-${index}`,
            title: item.querySelector('title')?.textContent || 'Untitled Update',
            date: new Date(item.querySelector('pubDate')?.textContent || Date.now()).toLocaleDateString(),
            link: item.querySelector('link')?.textContent || '#',
            description: item.querySelector('description')?.textContent || 'No description provided.'
        }));

        if (LIVE_PATCH_ITEMS.length === 0) {
            throw new Error('No items found in feed');
        }

        renderPatchSidebar(LIVE_PATCH_ITEMS);
        // Automatically select the first item
        selectPatchItem(LIVE_PATCH_ITEMS[0].id);

    } catch (e) {
        console.error('Failed fetching live patch notes:', e);
        listContainer.innerHTML = `
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 pb-2">Blizzard Feed</h3>
            <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-2">
                <p>Could not fetch live RSS feed due to browser restrictions.</p>
                <a href="https://news.blizzard.com/en-us/heroes-of-the-storm" target="_blank" class="text-sky-400 underline block font-semibold">Visit Official Blizzard News →</a>
            </div>
        `;
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

    // Highlight active state in sidebar
    document.querySelectorAll('#patch-sidebar-list button').forEach(b => {
        b.classList.remove('bg-sky-500/15', 'border-sky-500/70');
    });
    document.getElementById(`btn-${id}`)?.classList.add('bg-sky-500/15', 'border-sky-500/70');

    // Render full details in the main window
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
