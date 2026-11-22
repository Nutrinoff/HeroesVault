// ==========================================
// TIER LIST MODULE
// ==========================================

const TIER_LEAGUE_LABELS = {
    S: 'Diamond',
    A: 'Platinum',
    B: 'Gold',
    C: 'Silver',
    D: 'Bronze'
};

function resolveTierListPortraitUrl(hero) {
    const fallback = typeof HERO_FALLBACK_PORTRAIT === 'string'
        ? HERO_FALLBACK_PORTRAIT
        : 'https://via.placeholder.com/110?text=Hero';

    if (!hero) return fallback;
    const rawEntry = typeof getRawHeroEntry === 'function' ? getRawHeroEntry(hero.id) : null;
    const source = hero.portrait || rawEntry || hero;

    if (typeof resolveAssetUrl === 'function') {
        return resolveAssetUrl(source, fallback);
    }
    if (typeof getAssetUrl === 'function') {
        return getAssetUrl(hero.portrait, fallback) || fallback;
    }
    return fallback;
}

function createTierHeroButton(hero) {
    const fallback = typeof HERO_FALLBACK_PORTRAIT === 'string'
        ? HERO_FALLBACK_PORTRAIT
        : 'https://via.placeholder.com/110?text=Hero';
    const portraitUrl = resolveTierListPortraitUrl(hero);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex items-center gap-2 rounded-[2px] border border-[#38247a] bg-[#0c0621]/90 px-2.5 py-1.5 text-xs font-medium text-[#e6ecff] hover:border-[#58baff]/75 hover:bg-[#190e40]/90 transition cursor-pointer';
    btn.addEventListener('click', () => {
        if (typeof navigateTo === 'function') {
            navigateTo('builds', { hero: hero.id });
        } else if (typeof selectHero === 'function') {
            selectHero(hero.id, false);
        }
    });

    const img = document.createElement('img');
    img.src = portraitUrl;
    img.alt = `${hero.name || hero.id} portrait`;
    img.className = 'w-7 h-7 rounded-[2px] border border-[#5c42b8]/70 object-cover bg-[#070412] shrink-0';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
        if (img.src !== fallback) {
            img.src = fallback;
        }
    }, { once: true });

    const label = document.createElement('span');
    label.textContent = hero.name || hero.id;

    btn.append(img, label);
    return btn;
}

function renderTierList() {
    const box = document.getElementById('tierlist-rows-container');
    if (!box) return;

    const groups = { S: [], A: [], B: [], C: [], D: [] };
    const keyFn = typeof normalizeHeroKey === 'function'
        ? normalizeHeroKey
        : v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    Object.entries(MASTER_TIERS || {}).forEach(([k, ids]) => {
        (ids || []).forEach(id => {
            const rawId = typeof id === 'string' ? id : (id && id.id);
            const h = (MASTER_HERO_LIST || []).find(x => keyFn(x.id) === keyFn(rawId));
            const t = typeof tierLetter === 'function' ? tierLetter(k) : String(k || 'D').toUpperCase();
            if (h && groups[t] && !groups[t].some(x => x.id === h.id)) {
                groups[t].push(h);
            }
        });
    });

    const frag = document.createDocumentFragment();

    Object.entries(groups).forEach(([t, heroes]) => {
        const leagueName = TIER_LEAGUE_LABELS[t] || '';
        const r = document.createElement('section');
        r.className = 'hots-panel flex items-stretch overflow-hidden';

        const tierCell = document.createElement('div');
        tierCell.className = 'hots-subpanel w-32 shrink-0 flex flex-col items-center justify-center border-r border-[#38247a] px-2.5 py-3 gap-1';

        const tierBadge = document.createElement('span');
        tierBadge.className = 'hots-tier-btn is-active text-lg font-black leading-none whitespace-nowrap';
        tierBadge.dataset.tier = t;
        tierBadge.textContent = `${t} Tier`;

        const leagueLabel = document.createElement('span');
        leagueLabel.className = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[#8c83a2]';
        leagueLabel.textContent = leagueName;

        tierCell.append(tierBadge, leagueLabel);

        const heroesWrap = document.createElement('div');
        heroesWrap.className = 'p-3 flex flex-wrap items-center gap-2 min-h-20 flex-1 min-w-0';

        if (heroes.length > 0) {
            heroes.forEach(h => heroesWrap.appendChild(createTierHeroButton(h)));
        } else {
            const empty = document.createElement('span');
            empty.className = 'text-xs text-[#8c83a2] italic';
            empty.textContent = 'No heroes in this tier.';
            heroesWrap.appendChild(empty);
        }

        r.append(tierCell, heroesWrap);
        frag.appendChild(r);
    });

    box.replaceChildren(frag);
}
