// ==========================================
// 2. HERO HEADERS, ABILITIES & BUILDS VIEW
// ==========================================

const HERO_VIEW_ICON_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect width="44" height="44" fill="#0d0724"/><rect x="1" y="1" width="42" height="42" fill="none" stroke="#38247a" stroke-width="2"/><text x="22" y="28" fill="#9cb6ff" font-family="monospace" font-size="16" text-anchor="middle">?</text></svg>')}`;
const HERO_VIEW_PORTRAIT_FALLBACK = typeof HERO_FALLBACK_PORTRAIT === 'string'
    ? HERO_FALLBACK_PORTRAIT
    : HERO_VIEW_ICON_FALLBACK;

const ALLOWED_NOTES_TAGS = new Set([
    'P', 'BR', 'HR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'SMALL',
    'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'H3', 'H4', 'H5', 'H6',
    'SPAN', 'DIV', 'A', 'IMG'
]);
const BLOCKED_NOTES_TAGS = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META',
    'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT'
]);

function getHeroViewDomApi() {
    return window.HeroesVaultDom && typeof window.HeroesVaultDom === 'object'
        ? window.HeroesVaultDom
        : null;
}

function toHeroViewKey(value) {
    if (typeof normalizeHeroKey === 'function') {
        return normalizeHeroKey(value);
    }
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function isSafeNotesUrl(rawUrl, { allowDataImage = false } = {}) {
    const dom = getHeroViewDomApi();
    if (dom && typeof dom.isSafeUrl === 'function') {
        if (allowDataImage) {
            const trimmed = String(rawUrl || '').trim();
            if (/^data:image\/(?:png|jpe?g|gif|webp);/i.test(trimmed)) {
                return true;
            }
        }
        return dom.isSafeUrl(rawUrl, { allowDataImage: false });
    }

    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return false;
    if (allowDataImage && /^data:image\/(?:png|jpe?g|gif|webp);/i.test(trimmed)) {
        return true;
    }
    try {
        const parsed = new URL(trimmed, window.location.origin);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function decorateNotesMediaAttributes(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;

    container.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (isSafeNotesUrl(href, { allowDataImage: false })) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer');
        } else {
            anchor.removeAttribute('href');
        }
    });

    container.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (!isSafeNotesUrl(src, { allowDataImage: true })) {
            img.remove();
            return;
        }
        img.setAttribute('alt', img.getAttribute('alt') || '');
        img.setAttribute('loading', 'lazy');
    });
}

function sanitizeNodeForNotes(node, doc) {
    if (node.nodeType === Node.TEXT_NODE) {
        return doc.createTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const tagName = node.tagName.toUpperCase();
    if (BLOCKED_NOTES_TAGS.has(tagName)) {
        return null;
    }

    const frag = doc.createDocumentFragment();
    Array.from(node.childNodes).forEach(child => {
        const cleanChild = sanitizeNodeForNotes(child, doc);
        if (cleanChild) frag.appendChild(cleanChild);
    });

    if (!ALLOWED_NOTES_TAGS.has(tagName)) {
        return frag;
    }

    const cleanEl = doc.createElement(tagName.toLowerCase());
    if (tagName === 'A') {
        const href = node.getAttribute('href');
        if (isSafeNotesUrl(href)) {
            cleanEl.setAttribute('href', href.trim());
            cleanEl.setAttribute('target', '_blank');
            cleanEl.setAttribute('rel', 'noopener noreferrer');
        }
    } else if (tagName === 'IMG') {
        const src = node.getAttribute('src');
        if (!isSafeNotesUrl(src, { allowDataImage: true })) {
            return null;
        }
        cleanEl.setAttribute('src', src.trim());
        cleanEl.setAttribute('alt', node.getAttribute('alt') || '');
        cleanEl.setAttribute('loading', 'lazy');
    }

    cleanEl.appendChild(frag);
    return cleanEl;
}

function sanitizeBuildNotesHtml(rawHtml) {
    if (rawHtml == null) return '';
    const source = String(rawHtml);
    if (!source.trim()) return '';

    const dom = getHeroViewDomApi();
    if (dom && typeof dom.sanitizeHtml === 'function' && typeof DOMParser !== 'undefined') {
        const sanitized = dom.sanitizeHtml(source, { allowedTags: ALLOWED_NOTES_TAGS });
        const wrapper = document.createElement('div');
        wrapper.innerHTML = sanitized;
        decorateNotesMediaAttributes(wrapper);
        return wrapper.innerHTML;
    }

    if (typeof DOMParser === 'undefined') {
        if (dom && typeof dom.escapeHtml === 'function') {
            return dom.escapeHtml(source);
        }
        return source
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(source, 'text/html');
    const outDoc = document.implementation.createHTMLDocument('');
    const container = outDoc.createElement('div');

    Array.from(parsedDoc.body.childNodes).forEach(child => {
        const cleanNode = sanitizeNodeForNotes(child, outDoc);
        if (cleanNode) container.appendChild(cleanNode);
    });

    return container.innerHTML;
}

function setSafeImageSrc(imgEl, primaryUrl, fallbackUrl = '', { hideOnFail = false } = {}) {
    if (!imgEl) return;

    if (hideOnFail) {
        imgEl.style.display = '';
    }

    imgEl.onerror = null;
    if (fallbackUrl) {
        const dom = getHeroViewDomApi();
        if (dom && typeof dom.attachImageFallback === 'function') {
            dom.attachImageFallback(imgEl, fallbackUrl);
        } else if (typeof attachImageFallback === 'function') {
            attachImageFallback(imgEl, fallbackUrl);
        } else {
            imgEl.addEventListener('error', function onFallbackError() {
                imgEl.removeEventListener('error', onFallbackError);
                if (imgEl.getAttribute('src') !== fallbackUrl) {
                    imgEl.src = fallbackUrl;
                }
            });
        }
    } else if (hideOnFail) {
        imgEl.addEventListener('error', function onHideError() {
            imgEl.removeEventListener('error', onHideError);
            imgEl.style.display = 'none';
        });
    }

    if (primaryUrl) {
        imgEl.src = primaryUrl;
    } else if (fallbackUrl) {
        imgEl.src = fallbackUrl;
    } else if (hideOnFail) {
        imgEl.style.display = 'none';
    }
}

function isLostVikingsHero(hero) {
    if (!hero) return false;
    const idKey = toHeroViewKey(hero.id || hero.heroId || '');
    const nameKey = toHeroViewKey(hero.name || '');
    return idKey.includes('lostviking') || nameKey.includes('lostviking');
}

function getTalentGrantedAbilities(activeTalents) {
    if (!Array.isArray(activeTalents) || !activeTalents.length) return [];

    const granted = [];
    const seen = new Set();

    activeTalents.forEach(t => {
        if (!t) return;
        const keyUpper = String(t.abilityType || t.hotkey || t.key || '').toUpperCase();
        const isGrantedHotkey = ['Q', 'W', 'E'].includes(keyUpper) && (t.hasHotkey === true || !t.upgradesAbilityType);
        if (!isGrantedHotkey) return;

        const name = t.name || '';
        const sig = `${keyUpper}|${name.toLowerCase()}`;
        if (seen.has(sig)) return;
        seen.add(sig);

        granted.push({
            id: t.talentId || t.id || sig,
            name,
            key: keyUpper,
            icon: t.icon || '',
            shortText: t.shortText || '',
            fullText: t.fullText || t.description || '',
            cooldownText: t.cooldownText || '',
            category: 'Talent'
        });
    });

    return granted;
}

function getSelectedTalentsForBuild(h, code) {
    if (!h?.talents) return [];
    const p = typeof decodeBuildCode === 'function'
        ? decodeBuildCode(code)
        : [...DEFAULT_TALENT_SELECTIONS];
    const tiers = typeof TALENT_TIERS !== 'undefined' ? TALENT_TIERS : ['1', '4', '7', '10', '13', '16', '20'];

    return tiers.map((tier, idx) => {
        const tierList = h.talents?.[tier] || h.talents?.[`Level${tier}`] || [];
        const selIdx = Number(p[idx]) - 1;
        return selIdx >= 0 ? tierList[selIdx] || null : null;
    }).filter(Boolean);
}

function getAbilityHotkeyRank(ability) {
    const keyUpper = String(ability?.key || ability?.abilityType || '').toUpperCase();
    const catLower = String(ability?.category || '').toLowerCase();

    if (keyUpper === 'Q') return 1;
    if (keyUpper === 'W') return 2;
    if (keyUpper === 'E') return 3;
    if (keyUpper === 'TRAIT' || catLower === 'trait') return 5;
    if (keyUpper === 'Z' || catLower === 'mount') return 6;
    return 4;
}

function getAbilityGroupBucket(ability) {
    const rank = getAbilityHotkeyRank(ability);
    if (rank <= 4) return 0; // Core / stage abilities (Q, W, E, etc.)
    if (rank === 5) return 1; // Trait
    return 2; // Z / Mount
}

function buildStageRankMap(items) {
    const stageRanks = new Map();
    let nextVariantRank = 1;

    items.forEach(item => {
        const rawVariant = String(item?.variant || '').trim().toLowerCase();
        if (!rawVariant || rawVariant === 'base' || rawVariant === 'basic' || rawVariant === 'default') {
            if (!stageRanks.has(rawVariant)) {
                stageRanks.set(rawVariant, 0);
            }
        } else if (!stageRanks.has(rawVariant)) {
            stageRanks.set(rawVariant, nextVariantRank++);
        }
    });

    return stageRanks;
}

function renderAbilityStrip(abilitiesList, containerId, options = {}) {
    const box = document.getElementById(containerId);
    if (!box) return;

    // Keep the ability strip on a single row and allow horizontal scroll only if needed
    if (!box.classList.contains('flex-nowrap')) {
        box.classList.add('flex-nowrap', 'overflow-x-auto', 'overflow-y-hidden', 'max-w-full');
        box.classList.remove('flex-wrap');
    }

    const isVikings = Boolean(options.isLostVikings);
    let hasTrait = false;
    let hasMountZ = false;
    const seen = new Set();

    const baseList = (abilitiesList || []).filter(a => {
        const keyUpper = String(a.key || a.abilityType || '').toUpperCase();
        const nameLower = String(a.name || '').toLowerCase();
        const catLower = String(a.category || '').toLowerCase();
        const variantLower = String(a.variant || '').toLowerCase();

        if (['HEROIC', 'R', 'B'].includes(keyUpper) || catLower === 'hearth' || nameLower === 'hearth') {
            return false;
        }

        if (isVikings && (keyUpper === 'ACTIVE' || catLower === 'activable')) {
            return false;
        }

        const isTrait = keyUpper === 'TRAIT' || catLower === 'trait';
        if (isVikings && isTrait) {
            if (hasTrait) return false;
            hasTrait = true;
        }

        const isMountOrZ = keyUpper === 'Z' || catLower === 'mount' || nameLower.includes('mount');
        if (isMountOrZ) {
            if (isVikings) {
                if (hasMountZ) return false;
                hasMountZ = true;
            } else {
                const isCustomZ = nameLower.includes('tunnel') || nameLower.includes('flight') || nameLower.includes('burrow');
                if (!isCustomZ && (nameLower.includes('summon mount') || nameLower === 'mount' || catLower === 'mount')) {
                    return false;
                }
            }
        }

        if (isVikings && ['Q', 'W', 'E'].includes(keyUpper) && catLower !== 'talent') {
            return false;
        }

        const sig = `${keyUpper}|${nameLower}|${variantLower}`;
        if (seen.has(sig)) return false;
        seen.add(sig);

        return true;
    });

    const grantedAbilities = isVikings ? getTalentGrantedAbilities(options.activeTalents) : [];
    const combined = [...baseList, ...grantedAbilities];
    const stageRanks = buildStageRankMap(combined);

    const list = combined
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const bucketDiff = getAbilityGroupBucket(a.item) - getAbilityGroupBucket(b.item);
            if (bucketDiff !== 0) return bucketDiff;

            const stageA = stageRanks.get(String(a.item?.variant || '').trim().toLowerCase()) ?? 0;
            const stageB = stageRanks.get(String(b.item?.variant || '').trim().toLowerCase()) ?? 0;
            if (stageA !== stageB) return stageA - stageB;

            const hotkeyDiff = getAbilityHotkeyRank(a.item) - getAbilityHotkeyRank(b.item);
            if (hotkeyDiff !== 0) return hotkeyDiff;

            return a.index - b.index;
        })
        .map(entry => entry.item);

    if (!list.length) {
        const emptyEl = document.createElement('span');
        emptyEl.className = 'text-xs text-[#8c83a2]';
        emptyEl.textContent = 'No abilities configured';
        box.replaceChildren(emptyEl);
        return;
    }

    const useCompactDensity = list.length >= 7;
    const iconPx = useCompactDensity ? 28 : 32;
    const frag = document.createDocumentFragment();

    list.forEach(a => {
        const el = document.createElement('div');
        el.className = useCompactDensity
            ? 'hots-subpanel shrink-0 flex flex-col items-center gap-0.5 p-1 min-w-10 rounded-[2px] border border-[#38247a]'
            : 'hots-subpanel shrink-0 flex flex-col items-center gap-1 p-1.5 min-w-12 rounded-[2px] border border-[#38247a]';

        if (typeof showAbilityTooltip === 'function') {
            el.addEventListener('mouseenter', e => showAbilityTooltip(e, a));
        }
        if (typeof hideTooltip === 'function') {
            el.addEventListener('mouseleave', hideTooltip);
        }

        const iconImg = document.createElement('img');
        iconImg.className = useCompactDensity
            ? 'w-7 h-7 rounded-[2px] border border-[#5c42b8]/75 object-cover bg-[#070412]'
            : 'w-8 h-8 rounded-[2px] border border-[#5c42b8]/75 object-cover bg-[#070412]';
        iconImg.width = iconPx;
        iconImg.height = iconPx;
        iconImg.alt = a.name || a.key || 'Ability icon';
        setSafeImageSrc(
            iconImg,
            typeof resolveAssetUrl === 'function' ? resolveAssetUrl(a.icon, HERO_VIEW_ICON_FALLBACK) : HERO_VIEW_ICON_FALLBACK,
            HERO_VIEW_ICON_FALLBACK
        );

        const keySpan = document.createElement('span');
        keySpan.className = useCompactDensity
            ? 'text-[9px] leading-tight font-mono font-bold text-[#58baff]'
            : 'text-[10px] leading-tight font-mono font-bold text-[#58baff]';
        keySpan.textContent = a.key || a.abilityType || 'Z';

        el.append(iconImg, keySpan);

        if (a.variant) {
            const variantSpan = document.createElement('span');
            variantSpan.className = useCompactDensity
                ? 'text-[7px] leading-tight text-[#9cb6ff]/80 max-w-12 truncate'
                : 'text-[8px] leading-tight text-[#9cb6ff]/80 max-w-16 truncate';
            variantSpan.title = a.variant;
            variantSpan.textContent = a.variant;
            el.appendChild(variantSpan);
        }

        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function renderHeroHeader(heroData, activeTalents = []) {
    if (!heroData) return;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const portraitUrl = typeof resolveAssetUrl === 'function'
        ? resolveAssetUrl(heroData.portrait || rawEntry, HERO_VIEW_PORTRAIT_FALLBACK)
        : HERO_VIEW_PORTRAIT_FALLBACK;

    const portraitEl = document.getElementById('hero-portrait');
    const nameEl = document.getElementById('hero-name');
    const roleEl = document.getElementById('hero-role');
    const titleEl = document.getElementById('hero-title');

    if (portraitEl) {
        portraitEl.alt = `${heroData.name} portrait`;
        setSafeImageSrc(portraitEl, portraitUrl, HERO_VIEW_PORTRAIT_FALLBACK);
    }
    if (nameEl && nameEl.textContent !== heroData.name) nameEl.textContent = heroData.name;
    if (roleEl && roleEl.textContent !== heroData.role) roleEl.textContent = heroData.role;
    if (titleEl && titleEl.textContent !== heroData.title) titleEl.textContent = heroData.title;

    renderAbilityStrip(heroData.abilities, 'hero-abilities', {
        isLostVikings: isLostVikingsHero(rawEntry || heroData),
        activeTalents
    });
}

function renderBuilderHeader(heroData, activeTalents = []) {
    if (!heroData) return;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const heroSource = rawEntry || heroData;
    const portraitUrl = typeof resolveAssetUrl === 'function'
        ? resolveAssetUrl(heroData.portrait || rawEntry, HERO_VIEW_PORTRAIT_FALLBACK)
        : HERO_VIEW_PORTRAIT_FALLBACK;
    const loadingBgUrl = typeof getHeroLoadingPortrait === 'function'
        ? getHeroLoadingPortrait(heroSource)
        : '';

    const portraitEl = document.getElementById('builder-portrait');
    const nameEl = document.getElementById('builder-name');
    const roleEl = document.getElementById('builder-role');
    const titleEl = document.getElementById('builder-title');
    const bgModel = document.getElementById('builder-model-bg');

    if (portraitEl) {
        portraitEl.alt = `${heroData.name} portrait`;
        setSafeImageSrc(portraitEl, portraitUrl, HERO_VIEW_PORTRAIT_FALLBACK);
    }
    if (nameEl && nameEl.textContent !== heroData.name) nameEl.textContent = heroData.name;
    if (roleEl && roleEl.textContent !== heroData.role) roleEl.textContent = heroData.role;
    if (titleEl && titleEl.textContent !== heroData.title) titleEl.textContent = heroData.title;

    if (bgModel) {
        bgModel.alt = `${heroData.name} loading screen background`;
        setSafeImageSrc(
            bgModel,
            loadingBgUrl || portraitUrl,
            loadingBgUrl && portraitUrl !== loadingBgUrl ? portraitUrl : '',
            { hideOnFail: true }
        );
    }

    renderAbilityStrip(heroData.abilities, 'builder-abilities', {
        isLostVikings: isLostVikingsHero(heroSource),
        activeTalents
    });
}

function renderBuildStrip(h, code) {
    const box = document.getElementById('build-strip');
    if (!box) return;

    const p = typeof decodeBuildCode === 'function'
        ? decodeBuildCode(code)
        : [...DEFAULT_TALENT_SELECTIONS];
    const tiers = typeof TALENT_TIERS !== 'undefined' ? TALENT_TIERS : ['1', '4', '7', '10', '13', '16', '20'];
    const frag = document.createDocumentFragment();

    tiers.forEach((l, i) => {
        const t = h.talents?.[l]?.[p[i] - 1] || h.talents?.[l]?.[0];
        const el = document.createElement('div');

        el.className = 'hots-subpanel rounded-[2px] p-2 flex flex-col items-center gap-2 transition-all hover:border-[#58baff]/65';

        if (t) {
            if (typeof showTalentTooltip === 'function') {
                el.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            }
            if (typeof hideTooltip === 'function') {
                el.addEventListener('mouseleave', hideTooltip);
            }

            const talentImg = document.createElement('img');
            talentImg.className = 'w-11 h-11 rounded-[2px] border border-[#5c42b8]/75 object-cover bg-[#070412]';
            talentImg.width = 44;
            talentImg.height = 44;
            talentImg.alt = t.name || `Level ${l} talent`;
            setSafeImageSrc(
                talentImg,
                typeof resolveAssetUrl === 'function' ? resolveAssetUrl(t.icon, HERO_VIEW_ICON_FALLBACK) : HERO_VIEW_ICON_FALLBACK,
                HERO_VIEW_ICON_FALLBACK
            );

            const lvlSpan = document.createElement('span');
            lvlSpan.className = 'text-[10px] font-mono text-[#58baff]';
            lvlSpan.textContent = `Lv ${l}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-[10px] text-center text-[#e6ecff] truncate max-w-20';
            nameSpan.title = t.name || '';
            nameSpan.textContent = t.name || '';

            el.append(talentImg, lvlSpan, nameSpan);
        } else {
            const emptyTalentSpan = document.createElement('span');
            emptyTalentSpan.className = 'text-[10px] text-[#8c83a2]';
            emptyTalentSpan.textContent = `Lv ${l} · none`;
            el.appendChild(emptyTalentSpan);
        }

        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function findPersonalBuildEntry(hero) {
    const builds = typeof PERSONAL_BUILDS !== 'undefined' && Array.isArray(PERSONAL_BUILDS)
        ? PERSONAL_BUILDS
        : [];
    if (!builds.length || !hero) return null;

    const candidateKeys = new Set(
        [hero.id, hero.name]
            .map(toHeroViewKey)
            .filter(Boolean)
    );

    return builds.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const entryKeys = [entry.heroId, entry.id, entry.heroName, entry.name]
            .map(toHeroViewKey)
            .filter(Boolean);
        return entryKeys.some(k => candidateKeys.has(k));
    }) || null;
}

function renderActiveBuild() {
    const h = currentHeroData;
    if (!h) return;

    const d = findPersonalBuildEntry(h);
    const tabs = document.getElementById('build-tabs');
    const notes = document.getElementById('detail-notes');
    if (!tabs || !notes) return;

    if (!d?.builds?.length) {
        tabs.replaceChildren();
        notes.textContent = 'No notes added for this hero yet.';
        renderHeroHeader(h, []);
        renderBuildStrip(h, null);
        return;
    }

    const frag = document.createDocumentFragment();
    d.builds.forEach((v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-3.5 py-1.5 rounded-[2px] text-xs font-bold uppercase tracking-wider border cursor-pointer transition ${
            i === currentBuildIndex
                ? 'bg-[#1a2956]/80 text-[#cbe8ff] border-[#58baff]/75 shadow-[0_0_12px_rgba(0,156,255,0.25)]'
                : 'hots-subpanel text-[#9cb6ff]/80 border-[#38247a] hover:border-[#58baff]/55 hover:text-[#e6ecff]'
        }`;
        b.textContent = `Build ${i + 1}: ${v.buildName || 'Unnamed'}`;
        b.addEventListener('click', () => {
            currentBuildIndex = i;
            renderActiveBuild();
        });
        frag.appendChild(b);
    });

    tabs.replaceChildren(frag);

    const v = d.builds[currentBuildIndex] || d.builds[0];
    if (v.notes) {
        notes.innerHTML = sanitizeBuildNotesHtml(v.notes);
    } else {
        notes.textContent = 'No notes added yet.';
    }
    renderHeroHeader(h, getSelectedTalentsForBuild(h, v.buildCode));
    renderBuildStrip(h, v.buildCode);
}

async function selectHero(id, update = true) {
    if (!id) return;

    const heroData = typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(id) : null;
    if (!heroData) {
        console.error('Missing hero master entry', id);
        return;
    }

    currentSelectedHeroId = heroData.id || id;
    currentBuildIndex = 0;

    if (typeof switchTabUI === 'function') {
        switchTabUI('builds');
    }

    if (update && typeof navigateTo === 'function') {
        navigateTo('builds', { hero: currentSelectedHeroId });
    }

    filterHeroes();

    currentHeroData = heroData;
    renderActiveBuild();
}