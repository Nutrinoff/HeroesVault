// ==========================================
// NEXUS ACADEMY MODULE (FUNCTION CODE)
// ==========================================

const ACADEMY_API_BASE = (
    typeof window !== 'undefined' && typeof window.HEROESVAULT_API_BASE === 'string'
        ? window.HEROESVAULT_API_BASE
        : (typeof HEROESVAULT_API_BASE === 'string'
            ? HEROESVAULT_API_BASE
            : 'https://thesaurus-sage-headphones-meets.trycloudflare.com')
).trim().replace(/\/+$/, '');

let academyIndexCache = null;
let academyIndexInflight = null;
const ACADEMY_DETAIL_CACHE = new Map();
const ACADEMY_DETAIL_INFLIGHT = new Map();

function getFallbackAcademyArticlesList() {
    if (typeof window !== 'undefined' && Array.isArray(window.ACADEMY_ARTICLES)) {
        return window.ACADEMY_ARTICLES;
    }
    if (typeof ACADEMY_ARTICLES !== 'undefined' && Array.isArray(ACADEMY_ARTICLES)) {
        return ACADEMY_ARTICLES;
    }
    return [];
}

function getAcademyArticlesList() {
    if (Array.isArray(academyIndexCache)) {
        return academyIndexCache;
    }
    return getFallbackAcademyArticlesList();
}

function normalizeClientAcademyArticle(raw, fallbackId = '') {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || fallbackId || '').trim();
    if (!id) return null;

    const tags = Array.isArray(raw.tags)
        ? raw.tags.map(t => String(t || '').trim()).filter(Boolean)
        : (typeof raw.tags === 'string'
            ? raw.tags.split(',').map(t => t.trim()).filter(Boolean)
            : []);

    return {
        id,
        title: String(raw.title || id).trim(),
        category: String(raw.category || 'Mechanics').trim() || 'Mechanics',
        level: raw.level === 'Advanced' ? 'Advanced' : 'Basic',
        readTime: String(raw.readTime || '').trim(),
        tags,
        summary: String(raw.summary || '').trim(),
        markdown: typeof raw.markdown === 'string' ? raw.markdown : null
    };
}

async function fetchAcademyJsonSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn(`[Academy] Failed fetching ${url}:`, err); return null; } }  async function ensureAcademyIndexLoaded({ force = false } = {}) { if (!force && Array.isArray(academyIndexCache)) { return academyIndexCache; } if (!force && academyIndexInflight) { return academyIndexInflight; }  academyIndexInflight = (async () => { try { if (ACADEMY_API_BASE) { const remoteList = await fetchAcademyJsonSafe(`${ACADEMY_API_BASE}/api/academy`);
                if (Array.isArray(remoteList)) {
                    const normalized = remoteList
                        .map(item => {
                            const norm = normalizeClientAcademyArticle(item);
                            if (!norm) return null;
                            const cachedDetail = ACADEMY_DETAIL_CACHE.get(norm.id);
                            if (cachedDetail && typeof cachedDetail.markdown === 'string') {
                                return { ...norm, markdown: cachedDetail.markdown };
                            }
                            return norm;
                        })
                        .filter(Boolean);

                    academyIndexCache = normalized;
                    lastRenderedAcademySignature = null;
                    if (typeof syncHomeSummaryCounts === 'function') {
                        syncHomeSummaryCounts();
                    }
                    return academyIndexCache;
                }
            }

            const fallback = getFallbackAcademyArticlesList()
                .map(item => normalizeClientAcademyArticle(item))
                .filter(Boolean);
            academyIndexCache = fallback;
            return academyIndexCache;
        } finally {
            academyIndexInflight = null;
        }
    })();

    return academyIndexInflight;
}

async function fetchAcademyArticleDetail(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    if (ACADEMY_DETAIL_CACHE.has(cleanId)) {
        return ACADEMY_DETAIL_CACHE.get(cleanId);
    }
    if (ACADEMY_DETAIL_INFLIGHT.has(cleanId)) {
        return ACADEMY_DETAIL_INFLIGHT.get(cleanId);
    }

    const loadPromise = (async () => {
        try {
            const baseItem = getAcademyArticlesList().find(a => a.id === cleanId) || null;
            if (typeof baseItem?.markdown === 'string') {
                ACADEMY_DETAIL_CACHE.set(cleanId, baseItem);
                return baseItem;
            }

            if (ACADEMY_API_BASE) {
                const remoteDetail = await fetchAcademyJsonSafe(
                    `${ACADEMY_API_BASE}/api/academy/${encodeURIComponent(cleanId)}`
                );
                if (remoteDetail && typeof remoteDetail === 'object') {
                    const merged = normalizeClientAcademyArticle(
                        { ...(baseItem || {}), ...remoteDetail, id: cleanId },
                        cleanId
                    );
                    if (merged) {
                        ACADEMY_DETAIL_CACHE.set(cleanId, merged);
                        if (Array.isArray(academyIndexCache)) {
                            academyIndexCache = academyIndexCache.map(entry =>
                                entry.id === cleanId
                                    ? { ...entry, ...merged, markdown: merged.markdown }
                                    : entry
                            );
                        }
                        return merged;
                    }
                }
            }

            return baseItem;
        } finally {
            if (ACADEMY_DETAIL_INFLIGHT.get(cleanId) === loadPromise) {
                ACADEMY_DETAIL_INFLIGHT.delete(cleanId);
            }
        }
    })();

    ACADEMY_DETAIL_INFLIGHT.set(cleanId, loadPromise);
    return loadPromise;
}

let academyState = {
    level: 'all',
    category: 'All',
    search: '',
    activeId: null
};

let lastRenderedAcademySignature = null;

function getAcademyRenderSignature() {
    const articles = getAcademyArticlesList();
    const activeArticle = articles.find(a => a.id === academyState.activeId);
    const activeMarkdownLen = typeof activeArticle?.markdown === 'string'
        ? activeArticle.markdown.length
        : -1;

    return [
        academyState.level,
        academyState.category,
        academyState.search,
        String(academyState.activeId ?? ''),
        String(articles.length),
        String(activeMarkdownLen)
    ].join('||');
}

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
    const raw = String(text ?? '');
    if (!raw) return '';

    const codeTokens = [];
    const withPlaceholders = raw.replace(/`([^`\r\n]+)`/g, (_, codeContent) => {
        const token = `\u0000ACADEMYCODE${codeTokens.length}\u0000`;
        codeTokens.push(
            `<code class="px-1.5 py-0.5 rounded bg-[#070414] border border-[#38247a] text-[#cbe8ff] font-mono text-xs">${escapeAcademyHtml(codeContent)}</code>`
        );
        return token;
    });

    let out = escapeAcademyHtml(withPlaceholders);

    // Bold: **text** (avoid matching across whitespace-padded stray asterisks)
    out = out.replace(
        /\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g,
        '<strong class="font-bold text-[#e6ecff]">$1</strong>'
    );

    // Italic: *text* (single asterisks not adjacent to another asterisk or space boundary)
    out = out.replace(
        /(^|[^*])\*([^\s*](?:[^*\r\n]*[^\s*])?)\*(?!\*)/g,
        '$1<em class="italic text-[#9cb6ff]">$2</em>'
    );

    return out.replace(/\u0000ACADEMYCODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] ?? '');
}

function renderAcademyMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listType = null; // 'ul' | 'ol' | null
    let quoteLines = [];
    let inCodeBlock = false;
    let codeLines = [];

    const flushList = () => {
        if (!listType) return;
        html.push(listType === 'ol' ? '</ol>' : '</ul>');
        listType = null;
    };

    const flushQuote = () => {
        if (quoteLines.length === 0) return;
        const inner = quoteLines
            .map(l => `<p class="text-xs text-[#cbe8ff]/95 leading-relaxed">${formatAcademyInline(l)}</p>`)
            .join('');
        html.push(`<blockquote class="border-l-4 border-[#58baff] bg-[#0063c8]/15 rounded-r-xl px-4 py-3 space-y-1">${inner}</blockquote>`);
        quoteLines = [];
    };

    const flushCodeBlock = () => {
        if (!inCodeBlock) return;
        const escapedCode = escapeAcademyHtml(codeLines.join('\n'));
        html.push(`<pre class="p-3 rounded bg-[#070414] border border-[#38247a] text-xs font-mono text-[#cbe8ff] overflow-x-auto"><code>${escapedCode}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
    };

    for (const rawLine of lines) {
        const trimmedStart = rawLine.trimStart();

        if (trimmedStart.startsWith('```')) {
            flushList();
            flushQuote();
            if (inCodeBlock) {
                flushCodeBlock();
            } else {
                inCodeBlock = true;
                codeLines = [];
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(rawLine);
            continue;
        }

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
            html.push(`<h3 class="text-base font-bold text-[#58baff] pt-2">${formatAcademyInline(line.slice(4))}</h3>`);
            continue;
        }

        if (line.startsWith('## ')) {
            flushList();
            html.push(`<h2 class="hots-display text-lg font-extrabold pt-2">${formatAcademyInline(line.slice(3))}</h2>`);
            continue;
        }

        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (listType !== 'ol') {
                flushList();
                html.push('<ol class="list-decimal list-inside space-y-1.5 text-sm text-[#e6ecff]/90 pl-1">');
                listType = 'ol';
            }
            html.push(`<li class="leading-relaxed">${formatAcademyInline(olMatch[1])}</li>`);
            continue;
        }

        if (line.startsWith('- ') || (line.startsWith('* ') && !line.startsWith('**'))) {
            if (listType !== 'ul') {
                flushList();
                html.push('<ul class="list-disc list-inside space-y-1.5 text-sm text-[#e6ecff]/90 pl-1">');
                listType = 'ul';
            }
            html.push(`<li class="leading-relaxed">${formatAcademyInline(line.slice(2))}</li>`);
            continue;
        }

        flushList();
        html.push(`<p class="text-sm text-[#e6ecff]/90 leading-relaxed">${formatAcademyInline(line)}</p>`);
    }

    flushCodeBlock();
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
            article.markdown || ''
        ].join(' ').toLowerCase();

        return haystack.includes(q);
    });
}

function syncAcademyLevelButtons() {
    document.querySelectorAll('.academy-level-btn, [data-academy-level]').forEach(btn => {
        const active = btn.dataset.academyLevel === academyState.level;
        btn.setAttribute('aria-pressed', String(active));
        btn.classList.toggle('is-active', active);
    });
}

function setAcademyLevel(level) {
    if (academyState.level === level) return;
    academyState.level = level;
    lastRenderedAcademySignature = null;
    syncAcademyLevelButtons();
    renderAcademy();
}

function setAcademyCategory(category) {
    if (academyState.category === category) return;
    academyState.category = category;
    lastRenderedAcademySignature = null;
    renderAcademy();
}

function filterAcademyArticles() {
    const input = document.getElementById('academy-search');
    const nextSearch = input ? input.value : '';
    if (academyState.search === nextSearch) return;
    academyState.search = nextSearch;
    lastRenderedAcademySignature = null;
    renderAcademyListAndReader(false);
}

function selectAcademyArticle(id) {
    if (academyState.activeId === id) return;
    academyState.activeId = id;
    lastRenderedAcademySignature = null;
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
        btn.className = `academy-category-btn${active ? ' is-active' : ''}`;
        btn.textContent = cat;
        btn.addEventListener('click', () => setAcademyCategory(cat));
        frag.appendChild(btn);
    });

    container.replaceChildren(frag);
}

function buildAcademyArticleCardButton(article, isSelected) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `hots-list-item${isSelected ? ' is-selected' : ''}`;
    if (isSelected) {
        btn.setAttribute('aria-current', 'true');
    }

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between gap-2 mb-1.5';

    const catEl = document.createElement('span');
    catEl.className = 'hots-list-item__meta';
    catEl.textContent = article.category || 'General';

    const isAdvanced = article.level === 'Advanced';
    const levelEl = document.createElement('span');
    levelEl.className = `hots-list-tag ${isAdvanced ? 'hots-list-tag--gold' : 'hots-list-tag--cyan'} shrink-0`;
    levelEl.textContent = article.level || 'Basic';

    topRow.append(catEl, levelEl);

    const titleEl = document.createElement('div');
    titleEl.className = 'hots-list-item__title text-xs font-bold leading-snug';
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
        academyState.activeId = null;
        lastRenderedAcademySignature = null;

        const emptyListMsg = document.createElement('div');
        emptyListMsg.className = 'text-xs text-[#8c83a2] p-3 text-center';
        emptyListMsg.textContent = 'No guides match your current filter.';
        listEl.replaceChildren(emptyListMsg);

        const emptyReader = document.createElement('div');
        emptyReader.className = 'text-center py-10 space-y-2';

        const heading = document.createElement('p');
        heading.className = 'text-sm font-bold text-[#e6ecff]';
        heading.textContent = 'No matching Academy articles';

        const sub = document.createElement('p');
        sub.className = 'text-xs text-[#8c83a2]';
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

    if (typeof activeArticle.markdown !== 'string') {
        const targetId = activeArticle.id;
        fetchAcademyArticleDetail(targetId).then(fullArticle => {
            if (!fullArticle || typeof fullArticle.markdown !== 'string') return;
            if (academyState.activeId !== targetId) return;
            lastRenderedAcademySignature = null;
            renderAcademyListAndReader(false);
        });
    }

    const prevArticle = activeIndex > 0 ? filtered[activeIndex - 1] : null;
    const nextArticle = activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

    const readerFrag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'space-y-2 pb-4 border-b border-[#38247a]';

    const metaRow = document.createElement('div');
    metaRow.className = 'flex flex-wrap items-center gap-3 text-xs';

    const catLabel = document.createElement('span');
    catLabel.className = 'hots-list-tag hots-list-tag--meta hots-list-tag--active';
    catLabel.textContent = activeArticle.category || 'General';

    const isAdvanced = activeArticle.level === 'Advanced';
    const levelLabel = document.createElement('span');
    levelLabel.className = `hots-list-tag ${isAdvanced ? 'hots-list-tag--gold' : 'hots-list-tag--cyan'} hots-list-tag--active`;
    levelLabel.textContent = activeArticle.level || 'Basic';

    metaRow.append(catLabel, levelLabel);

    if (activeArticle.readTime) {
        const readTimeEl = document.createElement('span');
        readTimeEl.className = 'text-[#8c83a2] font-mono text-[11px]';
        readTimeEl.textContent = activeArticle.readTime;
        metaRow.appendChild(readTimeEl);
    }

    const titleHeading = document.createElement('h3');
    titleHeading.className = 'hots-display text-2xl font-extrabold';
    titleHeading.textContent = activeArticle.title || 'Untitled Guide';

    header.append(metaRow, titleHeading);

    if (activeArticle.summary) {
        const summaryEl = document.createElement('p');
        summaryEl.className = 'text-sm text-[#9cb6ff]/90 leading-relaxed';
        summaryEl.textContent = activeArticle.summary;
        header.appendChild(summaryEl);
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'space-y-3';
    bodyContainer.innerHTML = typeof activeArticle.markdown === 'string'
        ? renderAcademyMarkdown(activeArticle.markdown)
        : '<p class="text-xs text-[#8c83a2]">Loading guide content...</p>';

    const navEl = document.createElement('div');
    navEl.id = 'academy-article-nav';
    navEl.className = 'pt-4 border-t border-[#38247a] flex items-center justify-between gap-3';

    if (prevArticle) {
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'px-3.5 py-2 rounded bg-[#0c0621] hover:bg-[#1d1247] border border-[#38247a] hover:border-[#5c42b8] text-xs font-semibold text-[#cbe8ff] transition cursor-pointer';
        prevBtn.textContent = `← ${prevArticle.title}`;
        prevBtn.addEventListener('click', () => selectAcademyArticle(prevArticle.id));
        navEl.appendChild(prevBtn);
    } else {
        navEl.appendChild(document.createElement('span'));
    }

    if (nextArticle) {
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'px-3.5 py-2 rounded bg-[#0c0621] hover:bg-[#1d1247] border border-[#38247a] hover:border-[#5c42b8] text-xs font-semibold text-[#cbe8ff] transition cursor-pointer';
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
    syncAcademyLevelButtons();

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

    if (academyIndexCache === null && !academyIndexInflight) {
        ensureAcademyIndexLoaded().then(() => {
            if (!academyState.activeId) {
                academyState.activeId = getAcademyArticlesList()[0]?.id || null;
            }
            lastRenderedAcademySignature = null;
            renderAcademyCategories();
            renderAcademyListAndReader(false);
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        });
    }

    if (!academyState.activeId) {
        academyState.activeId = getAcademyArticlesList()[0]?.id || null;
    }

    const sig = getAcademyRenderSignature();
    if (sig === lastRenderedAcademySignature) {
        return;
    }
    lastRenderedAcademySignature = sig;

    renderAcademyCategories();
    renderAcademyListAndReader(false);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bindAcademyEvents();
        ensureAcademyIndexLoaded();
    }, { once: true });
} else {
    bindAcademyEvents();
    ensureAcademyIndexLoaded();
}
