// ==========================================
// 2. HERO HEADERS, ABILITIES & BUILDS VIEW
// ==========================================

const HERO_VIEW_ICON_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect width="44" height="44" fill="#0d0724"/><rect x="1" y="1" width="42" height="42" fill="none" stroke="#38247a" stroke-width="2"/><text x="22" y="28" fill="#9cb6ff" font-family="monospace" font-size="16" text-anchor="middle">?</text></svg>')}`;
const HERO_VIEW_PORTRAIT_FALLBACK = typeof HERO_FALLBACK_PORTRAIT === 'string'
    ? HERO_FALLBACK_PORTRAIT
    : HERO_VIEW_ICON_FALLBACK;

function setSafeImageSrc(imgEl, primaryUrl, fallbackUrl = '', { hideOnFail = false } = {}) {
    if (!imgEl) return;

    if (hideOnFail) {
        imgEl.style.display = '';
    }

    imgEl.onerror = null;
    if (fallbackUrl) {
        if (typeof attachImageFallback === 'function') {
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
    const norm = typeof normalizeHeroKey === 'function'
        ? normalizeHeroKey
        : v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const idKey = norm(hero.id || hero.heroId || '');
    const nameKey = norm(hero.name || '');
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
        box.innerHTML = '<span class="text-xs text-[#8c83a2]">No abilities configured</span>';
        return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(a => {
        const el = document.createElement('div');
        el.className = 'hots-subpanel flex flex-col items-center gap-1 p-1.5 min-w-12 rounded-[2px] border border-[#38247a]';
        if (typeof showAbilityTooltip === 'function') {
            el.addEventListener('mouseenter', e => showAbilityTooltip(e, a));
        }
        if (typeof hideTooltip === 'function') {
            el.addEventListener('mouseleave', hideTooltip);
        }

        const iconImg = document.createElement('img');
        iconImg.className = 'w-8 h-8 rounded-[2px] border border-[#5c42b8]/75 object-cover bg-[#070412]';
        iconImg.alt = a.name || a.key || 'Ability icon';
        setSafeImageSrc(
            iconImg,
            typeof resolveAssetUrl === 'function' ? resolveAssetUrl(a.icon, HERO_VIEW_ICON_FALLBACK) : HERO_VIEW_ICON_FALLBACK,
            HERO_VIEW_ICON_FALLBACK
        );

        const keySpan = document.createElement('span');
        keySpan.className = 'text-[10px] font-mono font-bold text-[#58baff]';
        keySpan.textContent = a.key || a.abilityType || 'Z';

        el.append(iconImg, keySpan);

        if (a.variant) {
            const variantSpan = document.createElement('span');
            variantSpan.className = 'text-[8px] text-[#9cb6ff]/80 max-w-16 truncate';
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
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;

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
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;

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
            el.innerHTML = `<span class="text-[10px] text-[#8c83a2]">Lv ${l} · none</span>`;
        }

        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function renderActiveBuild() {
    const h = currentHeroData;
    if (!h) return;

    const keyFn = typeof normalizeHeroKey === 'function'
        ? normalizeHeroKey
        : v => String(v || '').toLowerCase();

    const d = (PERSONAL_BUILDS || []).find(x => keyFn(x.heroId) === keyFn(h.id));
    const tabs = document.getElementById('build-tabs');
    const notes = document.getElementById('detail-notes');
    if (!tabs || !notes) return;

    if (!d?.builds?.length) {
        tabs.innerHTML = '';
        notes.innerText = 'No notes added for this hero yet.';
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
        b.innerText = `Build ${i + 1}: ${v.buildName || 'Unnamed'}`;
        b.addEventListener('click', () => {
            currentBuildIndex = i;
            renderActiveBuild();
        });
        frag.appendChild(b);
    });

    tabs.replaceChildren(frag);

    const v = d.builds[currentBuildIndex] || d.builds[0];
    notes.innerHTML = v.notes || 'No notes added yet.';
    renderHeroHeader(h, getSelectedTalentsForBuild(h, v.buildCode));
    renderBuildStrip(h, v.buildCode);
}

async function selectHero(id, update = true) {
    if (!id) return;

    currentSelectedHeroId = id;
    currentBuildIndex = 0;

    if (typeof switchTabUI === 'function') {
        switchTabUI('builds');
    }

    if (update && typeof navigateTo === 'function') {
        navigateTo('builds', { hero: id });
    }

    filterHeroes();

    const heroData = typeof getNormalizedHeroData === 'function' ? getNormalizedHeroData(id) : null;
    if (!heroData) {
        console.error('Missing hero master entry', id);
        return;
    }

    currentHeroData = heroData;
    renderHeroHeader(currentHeroData, []);
    renderActiveBuild();
}
