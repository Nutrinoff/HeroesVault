// ==========================================
// NEXUS ACADEMY MODULE (FUNCTION CODE)
// ==========================================

function getAcademyArticlesList() {
    return Array.isArray(window.ACADEMY_ARTICLES)
        ? window.ACADEMY_ARTICLES
        : (typeof ACADEMY_ARTICLES !== 'undefined' && Array.isArray(ACADEMY_ARTICLES) ? ACADEMY_ARTICLES : []);
}

let academyState = {
    level: 'all',
    category: 'All',
    search: '',
    activeId: null
};

function getAcademyCategories() {
    const articles = getAcademyArticlesList();
    const set = new Set(['All']);
    articles.forEach(a => {
        if (a?.category) set.add(a.category);
    });
    return Array.from(set);
}

function escapeAcademyHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatAcademyInline(text) {
    let out = escapeAcademyHtml(text);
    // Inline code: `code`
    out = out.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300 font-mono text-xs">$1</code>');
    // Bold: **text**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    // Italic: *text*
    out = out.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-200">$1</em>');
    return out;
}

function renderAcademyMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listType = null; // 'ul' | 'ol' | null
    let quoteLines = [];

    const flushList = () => {
        if (!listType) return;
        html.push(listType === 'ol' ? '</ol>' : '</ul>');
        listType = null;
    };

    const flushQuote = () => {
        if (quoteLines.length === 0) return;
        const inner = quoteLines.map(l => `<p class="text-xs text-sky-100/90 leading-relaxed">${formatAcademyInline(l)}</p>`).join('');
        html.push(`<blockquote class="border-l-4 border-sky-400 bg-sky-500/10 rounded-r-xl px-4 py-3 space-y-1">${inner}</blockquote>`);
        quoteLines = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushList();
            flushQuote();
            continue;
        }

        if (line.startsWith('>')) {
            flushList();
            quoteLines.push(line.replace(/^>\s?/, ''));
            continue;
        }
        flushQuote();

        if (line.startsWith('### ')) {
            flushList();
            html.push(`<h3 class="text-base font-bold text-sky-400 pt-2">${formatAcademyInline(line.slice(4))}</h3>`);
            continue;
        }

        if (line.startsWith('## ')) {
            flushList();
            html.push(`<h2 class="text-lg font-extrabold text-white pt-2">${formatAcademyInline(line.slice(3))}</h2>`);
            continue;
        }

        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (listType !== 'ol') {
                flushList();
                html.push('<ol class="list-decimal list-inside space-y-1.5 text-sm text-slate-300 pl-1">');
                listType = 'ol';
            }
            html.push(`<li class="leading-relaxed">${formatAcademyInline(olMatch[1])}</li>`);
            continue;
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
            if (listType !== 'ul') {
                flushList();
                html.push('<ul class="list-disc list-inside space-y-1.5 text-sm text-slate-300 pl-1">');
                listType = 'ul';
            }
            html.push(`<li class="leading-relaxed">${formatAcademyInline(line.slice(2))}</li>`);
            continue;
        }

        flushList();
        html.push(`<p class="text-sm text-slate-300 leading-relaxed">${formatAcademyInline(line)}</p>`);
    }

    flushList();
    flushQuote();
    return html.join('\n');
}

function getFilteredAcademyArticles() {
    const articles = getAcademyArticlesList();
    const q = academyState.search.trim().toLowerCase();

    return articles.filter(article => {
        const levelOk = academyState.level === 'all' || article.level === academyState.level;
        const catOk = academyState.category === 'All' || article.category === academyState.category;
        if (!levelOk || !catOk) return false;
        if (!q) return true;

        const haystack = [
            article.title,
            article.category,
            article.level,
            article.summary,
            ...(article.tags || []),
            article.markdown
        ].join(' ').toLowerCase();

        return haystack.includes(q);
    });
}

function setAcademyLevel(level) {
    academyState.level = level;
    document.querySelectorAll('.academy-level-btn').forEach(btn => {
        const active = btn.dataset.academyLevel === level;
        btn.className = active
            ? 'academy-level-btn px-3 py-1 rounded-lg text-xs font-bold bg-sky-500 text-slate-950 transition'
            : 'academy-level-btn px-3 py-1 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition';
    });
    renderAcademy();
}

function setAcademyCategory(category) {
    academyState.category = category;
    renderAcademy();
}

function filterAcademyArticles() {
    const input = document.getElementById('academy-search');
    academyState.search = input ? input.value : '';
    renderAcademyListAndReader(false);
}

function selectAcademyArticle(id) {
    academyState.activeId = id;
    renderAcademyListAndReader(true);
}

function renderAcademyCategories() {
    const container = document.getElementById('academy-category-tabs');
    if (!container) return;

    const categories = getAcademyCategories();
    container.innerHTML = categories.map(cat => {
        const active = academyState.category === cat;
        return `
            <button
                type="button"
                onclick="setAcademyCategory('${escapeAcademyHtml(cat)}')"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                    active
                        ? 'bg-purple-500/20 text-purple-200 border-purple-400/50'
                        : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }"
            >${escapeAcademyHtml(cat)}</button>
        `;
    }).join('');
}

function getLevelBadgeClasses(level) {
    if (level === 'Advanced') {
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    }
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

function renderAcademyListAndReader(scrollReader) {
    const listEl = document.getElementById('academy-article-list');
    const readerEl = document.getElementById('academy-article-reader');
    if (!listEl || !readerEl) return;

    const filtered = getFilteredAcademyArticles();

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-xs text-slate-500 p-3 text-center">No guides match your current filter.</div>`;
        readerEl.innerHTML = `
            <div class="text-center py-10 space-y-2">
                <p class="text-sm font-bold text-slate-200">No matching Academy articles</p>
                <p class="text-xs text-slate-400">Try clearing your search or switching Basic / Advanced / Category filters.</p>
            </div>
        `;
        return;
    }

    if (!filtered.some(a => a.id === academyState.activeId)) {
        academyState.activeId = filtered[0].id;
    }

    const activeIndex = filtered.findIndex(a => a.id === academyState.activeId);
    const activeArticle = filtered[activeIndex] || filtered[0];

    listEl.innerHTML = filtered.map(article => {
        const isSelected = article.id === activeArticle.id;
        return `
            <button
                type="button"
                onclick="selectAcademyArticle('${escapeAcademyHtml(article.id)}')"
                class="w-full text-left p-2.5 rounded-xl border transition ${
                    isSelected
                        ? 'bg-sky-500/15 border-sky-500/60 text-white'
                        : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/70'
                }"
            >
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-sky-400">${escapeAcademyHtml(article.category)}</span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getLevelBadgeClasses(article.level)}">${escapeAcademyHtml(article.level)}</span>
                </div>
                <div class="text-xs font-bold leading-snug">${escapeAcademyHtml(article.title)}</div>
            </button>
        `;
    }).join('');

    const prevArticle = activeIndex > 0 ? filtered[activeIndex - 1] : null;
    const nextArticle = activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

    readerEl.innerHTML = `
        <div class="space-y-2 pb-4 border-b border-slate-800/90">
            <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="px-2.5 py-0.5 rounded-full font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">${escapeAcademyHtml(activeArticle.category)}</span>
                <span class="px-2.5 py-0.5 rounded-full font-semibold border ${getLevelBadgeClasses(activeArticle.level)}">${escapeAcademyHtml(activeArticle.level)}</span>
                ${activeArticle.readTime ? `<span class="text-slate-400 font-mono text-[11px]">${escapeAcademyHtml(activeArticle.readTime)}</span>` : ''}
            </div>
            <h3 class="text-2xl font-extrabold text-white">${escapeAcademyHtml(activeArticle.title)}</h3>
            ${activeArticle.summary ? `<p class="text-sm text-slate-400 leading-relaxed">${escapeAcademyHtml(activeArticle.summary)}</p>` : ''}
        </div>

        <div class="space-y-3">
            ${renderAcademyMarkdown(activeArticle.markdown)}
        </div>

        <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
            ${prevArticle
                ? `<button type="button" onclick="selectAcademyArticle('${escapeAcademyHtml(prevArticle.id)}')" class="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition">&larr; ${escapeAcademyHtml(prevArticle.title)}</button>`
                : `<span></span>`
            }
            ${nextArticle
                ? `<button type="button" onclick="selectAcademyArticle('${escapeAcademyHtml(nextArticle.id)}')" class="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition">${escapeAcademyHtml(nextArticle.title)} &rarr;</button>`
                : `<span></span>`
            }
        </div>
    `;

    if (scrollReader && window.innerWidth < 1024) {
        readerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function renderAcademy() {
    if (!academyState.activeId) {
        academyState.activeId = getAcademyArticlesList()[0]?.id || null;
    }
    renderAcademyCategories();
    renderAcademyListAndReader(false);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}
