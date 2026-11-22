// ==========================================
// 2. HERO HEADERS, ABILITIES & BUILDS VIEW
// ==========================================

const HERO_VIEW_ICON_FALLBACK = 'https://via.placeholder.com/44?text=?';

function setSafeImageSrc(imgEl, primaryUrl, fallbackUrl = '', { hideOnFail = false } = {}) {
    if (!imgEl) return;

    imgEl.onerror = () => {
        imgEl.onerror = null;
        if (fallbackUrl && imgEl.src !== fallbackUrl) {
            imgEl.src = fallbackUrl;
        } else if (hideOnFail) {
            imgEl.style.display = 'none';
        }
    };

    if (hideOnFail) {
        imgEl.style.display = '';
    }

    if (primaryUrl) {
        imgEl.src = primaryUrl;
    } else if (fallbackUrl) {
        imgEl.src = fallbackUrl;
    } else if (hideOnFail) {
        imgEl.style.display = 'none';
    }
}

function renderAbilityStrip(abilitiesList, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;

    const list = (abilitiesList || []).filter(a => {
        const keyUpper = String(a.key || '').toUpperCase();
        const nameLower = String(a.name || '').toLowerCase();
        const catLower = String(a.category || '').toLowerCase();

        if (['HEROIC', 'R', 'B'].includes(keyUpper) || catLower === 'hearth' || nameLower === 'hearth') {
            return false;
        }

        if (keyUpper === 'Z' || catLower === 'mount' || nameLower.includes('mount')) {
            const isCustomZ = nameLower.includes('tunnel') || nameLower.includes('flight') || nameLower.includes('burrow');
            if (!isCustomZ && (nameLower.includes('summon mount') || nameLower === 'mount' || catLower === 'mount')) {
                return false;
            }
        }

        return true;
    });

    if (!list.length) {
        box.innerHTML = '<span class="text-xs text-violet-300/60">No abilities configured</span>';
        return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(a => {
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center gap-1 bg-[#090417]/80 border border-[#371e78] rounded p-1.5 min-w-12';
        if (typeof showAbilityTooltip === 'function') {
            el.addEventListener('mouseenter', e => showAbilityTooltip(e, a));
        }
        if (typeof hideTooltip === 'function') {
            el.addEventListener('mouseleave', hideTooltip);
        }

        const iconImg = document.createElement('img');
        iconImg.className = 'w-8 h-8 rounded-sm border border-[#4a2b9c] object-cover';
        iconImg.alt = a.name || a.key || 'Ability icon';
        setSafeImageSrc(
            iconImg,
            resolveHeroUiPortraitUrl(a.icon),
            HERO_VIEW_ICON_FALLBACK
        );

        const keySpan = document.createElement('span');
        keySpan.className = 'text-[10px] font-mono font-bold text-cyan-300';
        keySpan.textContent = a.key || 'Z';

        el.append(iconImg, keySpan);

        if (a.variant) {
            const variantSpan = document.createElement('span');
            variantSpan.className = 'text-[8px] text-violet-200/75 max-w-16 truncate';
            variantSpan.title = a.variant;
            variantSpan.textContent = a.variant;
            el.appendChild(variantSpan);
        }

        frag.appendChild(el);
    });

    box.replaceChildren(frag);
}

function renderHeroHeader(heroData) {
    if (!heroData) return;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const portraitUrl = resolveHeroUiPortraitUrl(heroData.portrait || rawEntry);

    const portraitEl = document.getElementById('hero-portrait');
    const nameEl = document.getElementById('hero-name');
    const roleEl = document.getElementById('hero-role');
    const titleEl = document.getElementById('hero-title');

    if (portraitEl) {
        portraitEl.alt = `${heroData.name} portrait`;
        setSafeImageSrc(portraitEl, portraitUrl, HERO_FALLBACK_PORTRAIT);
    }
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;

    renderAbilityStrip(heroData.abilities, 'hero-abilities');
}

function renderBuilderHeader(heroData) {
    if (!heroData) return;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(heroData.id) : null;
    const heroSource = rawEntry || heroData;
    const portraitUrl = resolveHeroUiPortraitUrl(heroData.portrait || rawEntry);
    const loadingArtUrl = typeof getHeroLoadingPortrait === 'function'
        ? getHeroLoadingPortrait(heroSource)
        : '';

    const portraitEl = document.getElementById('builder-portrait');
    const nameEl = document.getElementById('builder-name');
    const roleEl = document.getElementById('builder-role');
    const titleEl = document.getElementById('builder-title');
    const loadingArtEl = document.getElementById('builder-loading-art');

    if (portraitEl) {
        portraitEl.alt = `${heroData.name} portrait`;
        setSafeImageSrc(portraitEl, portraitUrl, HERO_FALLBACK_PORTRAIT);
    }
    if (nameEl) nameEl.innerText = heroData.name;
    if (roleEl) roleEl.innerText = heroData.role;
    if (titleEl) titleEl.innerText = heroData.title;

    if (loadingArtEl) {
        loadingArtEl.alt = `${heroData.name} loading screen portrait`;
        setSafeImageSrc(
            loadingArtEl,
            loadingArtUrl || portraitUrl,
            loadingArtUrl && portraitUrl !== loadingArtUrl ? portraitUrl : '',
            { hideOnFail: true }
        );
    }

    renderAbilityStrip(heroData.abilities, 'builder-abilities');
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

        el.className = 'hots-subpanel rounded p-2 flex flex-col items-center gap-2 transition-all hover:border-cyan-400/60';

        if (t) {
            if (typeof showTalentTooltip === 'function') {
                el.addEventListener('mouseenter', e => showTalentTooltip(e, t, l));
            }
            if (typeof hideTooltip === 'function') {
                el.addEventListener('mouseleave', hideTooltip);
            }

            const talentImg = document.createElement('img');
            talentImg.className = 'w-11 h-11 rounded-sm border border-[#4a2b9c] object-cover';
            talentImg.alt = t.name || `Level ${l} talent`;
            setSafeImageSrc(
                talentImg,
                resolveHeroUiPortraitUrl(t.icon),
                HERO_VIEW_ICON_FALLBACK
            );

            const lvlSpan = document.createElement('span');
            lvlSpan.className = 'text-[10px] font-mono text-cyan-300';
            lvlSpan.textContent = `Lv ${l}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-[10px] text-center text-slate-100 truncate max-w-20';
            nameSpan.title = t.name || '';
            nameSpan.textContent = t.name || '';

            el.append(talentImg, lvlSpan, nameSpan);
        } else {
            el.innerHTML = `<span class="text-[10px] text-violet-300/60">Lv ${l} · none</span>`;
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
        renderBuildStrip(h, null);
        return;
    }

    const frag = document.createDocumentFragment();
    d.builds.forEach((v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider border cursor-pointer ${
            i === currentBuildIndex
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/55'
                : 'bg-[#090417] text-violet-200/75 border-[#321a6e] hover:border-cyan-400/50'
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
    renderHeroHeader(currentHeroData);
    renderActiveBuild();
}
