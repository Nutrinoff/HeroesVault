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
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    document.querySelectorAll('.academy-level-btn, [data-academy-level]').forEach(btn => {
        const active = btn.dataset.academyLevel === level;
        btn.setAttribute('aria-pressed', String(active));
        btn.classList.remove(
            'bg-sky-500',
            'text-slate-950',
            'text-slate-300',
            'hover:bg-slate-800',
            'hover:text-white'
        );
        btn.classList.add(
            'px-3',
            'py-1',
            'rounded-lg',
            'text-xs',
            'font-bold',
            'transition',
            ...(active
                ? ['bg-sky-500', 'text-slate-950']
                : ['text-slate-300', 'hover:bg-slate-800', 'hover:text-white'])
        );
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
    const frag = document.createDocumentFragment();

    categories.forEach(cat => {
        const active = academyState.category === cat;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(active));
        btn.className = `px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
            active
                ? 'bg-purple-500/20 text-purple-200 border-purple-400/50'
                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
        }`;
        btn.textContent = cat;
        btn.addEventListener('click', () => setAcademyCategory(cat));
        frag.appendChild(btn);
    });

    container.replaceChildren(frag);
}

function getLevelBadgeClasses(level) {
    if (level === 'Advanced') {
        return ['bg-amber-500/15', 'text-amber-300', 'border-amber-500/30'];
    }
    return ['bg-emerald-500/15', 'text-emerald-300', 'border-emerald-500/30'];
}

function buildAcademyArticleCardButton(article, isSelected) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `w-full text-left p-2.5 rounded-xl border transition ${
        isSelected
            ? 'bg-sky-500/15 border-sky-500/60 text-white'
            : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/70'
    }`;

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between gap-2 mb-1';

    const catEl = document.createElement('span');
    catEl.className = 'text-[10px] font-bold uppercase tracking-wider text-sky-400';
    catEl.textContent = article.category || 'General';

    const levelEl = document.createElement('span');
    levelEl.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded border';
    levelEl.classList.add(...getLevelBadgeClasses(article.level));
    levelEl.textContent = article.level || 'Basic';

    topRow.append(catEl, levelEl);

    const titleEl = document.createElement('div');
    titleEl.className = 'text-xs font-bold leading-snug';
    titleEl.textContent = article.title || 'Untitled Guide';

    btn.append(topRow, titleEl);
    btn.addEventListener('click', () => selectAcademyArticle(article.id));
    return btn;
}

function renderAcademyListAndReader(scrollReader) {
    const listEl = document.getElementById('academy-article-list');
    const readerEl = document.getElementById('academy-article-reader');
    if (!listEl || !readerEl) return;

    const filtered = getFilteredAcademyArticles();

    if (filtered.length === 0) {
        const emptyListMsg = document.createElement('div');
        emptyListMsg.className = 'text-xs text-slate-500 p-3 text-center';
        emptyListMsg.textContent = 'No guides match your current filter.';
        listEl.replaceChildren(emptyListMsg);

        const emptyReader = document.createElement('div');
        emptyReader.className = 'text-center py-10 space-y-2';

        const heading = document.createElement('p');
        heading.className = 'text-sm font-bold text-slate-200';
        heading.textContent = 'No matching Academy articles';

        const sub = document.createElement('p');
        sub.className = 'text-xs text-slate-400';
        sub.textContent = 'Try clearing your search or switching Basic / Advanced / Category filters.';

        emptyReader.append(heading, sub);
        readerEl.replaceChildren(emptyReader);
        return;
    }

    if (!filtered.some(a => a.id === academyState.activeId)) {
        academyState.activeId = filtered[0].id;
    }

    const activeIndex = filtered.findIndex(a => a.id === academyState.activeId);
    const activeArticle = filtered[activeIndex] || filtered[0];

    const listFrag = document.createDocumentFragment();
    filtered.forEach(article => {
        listFrag.appendChild(buildAcademyArticleCardButton(article, article.id === activeArticle.id));
    });
    listEl.replaceChildren(listFrag);

    const prevArticle = activeIndex > 0 ? filtered[activeIndex - 1] : null;
    const nextArticle = activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

    const readerFrag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'space-y-2 pb-4 border-b border-slate-800/90';

    const metaRow = document.createElement('div');
    metaRow.className = 'flex flex-wrap items-center gap-2 text-xs';

    const catBadge = document.createElement('span');
    catBadge.className = 'px-2.5 py-0.5 rounded-full font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30';
    catBadge.textContent = activeArticle.category || 'General';

    const levelBadge = document.createElement('span');
    levelBadge.className = 'px-2.5 py-0.5 rounded-full font-semibold border';
    levelBadge.classList.add(...getLevelBadgeClasses(activeArticle.level));
    levelBadge.textContent = activeArticle.level || 'Basic';

    metaRow.append(catBadge, levelBadge);

    if (activeArticle.readTime) {
        const readTimeEl = document.createElement('span');
        readTimeEl.className = 'text-slate-400 font-mono text-[11px]';
        readTimeEl.textContent = activeArticle.readTime;
        metaRow.appendChild(readTimeEl);
    }

    const titleHeading = document.createElement('h3');
    titleHeading.className = 'text-2xl font-extrabold text-white';
    titleHeading.textContent = activeArticle.title || 'Untitled Guide';

    header.append(metaRow, titleHeading);

    if (activeArticle.summary) {
        const summaryEl = document.createElement('p');
        summaryEl.className = 'text-sm text-slate-400 leading-relaxed';
        summaryEl.textContent = activeArticle.summary;
        header.appendChild(summaryEl);
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'space-y-3';
    bodyContainer.innerHTML = renderAcademyMarkdown(activeArticle.markdown);

    const navEl = document.createElement('div');
    navEl.id = 'academy-article-nav';
    navEl.className = 'pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3';

    if (prevArticle) {
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition';
        prevBtn.textContent = `← ${prevArticle.title}`;
        prevBtn.addEventListener('click', () => selectAcademyArticle(prevArticle.id));
        navEl.appendChild(prevBtn);
    } else {
        navEl.appendChild(document.createElement('span'));
    }

    if (nextArticle) {
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition';
        nextBtn.textContent = `${nextArticle.title} →`;
        nextBtn.addEventListener('click', () => selectAcademyArticle(nextArticle.id));
        navEl.appendChild(nextBtn);
    } else {
        navEl.appendChild(document.createElement('span'));
    }

    readerFrag.append(header, bodyContainer, navEl);
    readerEl.replaceChildren(readerFrag);

    if (scrollReader && window.innerWidth < 1024) {
        readerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function bindAcademyEvents() {
    document.querySelectorAll('[data-academy-level]').forEach(btn => {
        if (btn.dataset.academyLevelBound === 'true') return;
        btn.dataset.academyLevelBound = 'true';
        const level = btn.getAttribute('data-academy-level');
        btn.addEventListener('click', () => setAcademyLevel(level));
    });

    const searchInput = document.getElementById('academy-search');
    if (searchInput && searchInput.dataset.academySearchBound !== 'true') {
        searchInput.dataset.academySearchBound = 'true';
        searchInput.addEventListener('input', filterAcademyArticles);
    }
}

function renderAcademy() {
    bindAcademyEvents();
    if (!academyState.activeId) {
        academyState.activeId = getAcademyArticlesList()[0]?.id || null;
    }
    renderAcademyCategories();
    renderAcademyListAndReader(false);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAcademyEvents, { once: true });
} else {
    bindAcademyEvents();
}
