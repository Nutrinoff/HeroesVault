// ==========================================
// TIER LIST MODULE
// ==========================================

const TIER_STYLES = {
    S: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
    A: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
    B: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
    C: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
    D: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40' }
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
    btn.className = 'flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 hover:border-sky-400 transition cursor-pointer';
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
    img.className = 'w-7 h-7 rounded object-cover';
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
        const s = TIER_STYLES[t] || TIER_STYLES.D;
        const r = document.createElement('section');
        r.className = 'flex items-stretch overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70';

        const tierBadge = document.createElement('div');
        tierBadge.className = `w-24 shrink-0 flex items-center justify-center border-r ${s.border} ${s.bg} ${s.text} text-2xl font-black`;
        tierBadge.textContent = t;

        const heroesWrap = document.createElement('div');
        heroesWrap.className = 'p-3 flex flex-wrap items-center gap-2 min-h-20';

        if (heroes.length > 0) {
            heroes.forEach(h => heroesWrap.appendChild(createTierHeroButton(h)));
        } else {
            const empty = document.createElement('span');
            empty.className = 'text-xs text-slate-500 italic';
            empty.textContent = 'No heroes in this tier.';
            heroesWrap.appendChild(empty);
        }

        r.append(tierBadge, heroesWrap);
        frag.appendChild(r);
    });

    box.replaceChildren(frag);
}
