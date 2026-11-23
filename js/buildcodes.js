// ==========================================
// 1. TALENT TIERS & BUILD CODE CONSTANTS
// ==========================================

const TALENT_TIERS = ['1', '4', '7', '10', '13', '16', '20'];
const DEFAULT_TALENT_SELECTIONS = [1, 1, 1, 1, 1, 1, 1];
const EMPTY_TALENT_SELECTIONS = [0, 0, 0, 0, 0, 0, 0];


// ==========================================
// 2. SELECTION NORMALIZATION & ENCODING
// ==========================================

function normalizeTalentSelections(selections, options = {}) {
    const allowZero = Boolean(options && options.allowZero);
    const minVal = allowZero ? 0 : 1;
    const fallback = allowZero ? [...EMPTY_TALENT_SELECTIONS] : [...DEFAULT_TALENT_SELECTIONS];

    if (!Array.isArray(selections) || selections.length !== TALENT_TIERS.length) {
        return fallback;
    }

    return selections.map((val, idx) => {
        const num = Number(val);
        if (Number.isInteger(num) && num >= minVal && num <= 6) {
            return num;
        }
        return fallback[idx];
    });
}

function encodeTalentSelections(selections, options = {}) {
    return normalizeTalentSelections(selections, options).join('');
}

function formatHeroCodeLabel(heroId = '') {
    const raw = String(heroId || '').trim();
    if (!raw) return 'Hero';
    return raw;
}

function encodeBuildCode(selections, heroId = '', options = {}) {
    const encoded = encodeTalentSelections(selections, options);
    const trimmedHero = String(heroId || '').trim();
    if (!trimmedHero) return `[T${encoded}]`;
    return `[T${encoded},${trimmedHero}]`;
}

function encodeIngameBuildCode(selections, heroId = '', options = {}) {
    const encoded = encodeTalentSelections(selections, options);
    const label = formatHeroCodeLabel(heroId);
    return `[T${encoded},${label}]`;
}


// ==========================================
// 3. BUILD CODE DECODING & PARSE STATUS
// ==========================================

function parseTalentSelectionsWithStatus(codeOrString, options = {}) {
    const allowZero = Boolean(options && options.allowZero);
    const fallback = allowZero ? [...EMPTY_TALENT_SELECTIONS] : [...DEFAULT_TALENT_SELECTIONS];
    const trimmed = String(codeOrString || '').trim();

    if (!trimmed) {
        return {
            selections: fallback,
            valid: false,
            hadZero: false,
            normalized: true,
            reason: 'empty'
        };
    }

    const zeroCapablePattern = /^\[?T([0-6]{7})(?:,[^\]]*)?\]?$/i;
    const zeroCapableBarePattern = /^([0-6]{7})$/;
    const match = trimmed.match(zeroCapablePattern) || trimmed.match(zeroCapableBarePattern);

    if (!match) {
        return {
            selections: fallback,
            valid: false,
            hadZero: false,
            normalized: true,
            reason: 'invalid-format'
        };
    }

    const digits = match[1].split('').map(digit => Number(digit));
    const hadZero = digits.includes(0);

    if (!allowZero && hadZero) {
        return {
            selections: [...DEFAULT_TALENT_SELECTIONS],
            valid: false,
            hadZero: true,
            normalized: true,
            reason: 'contains-zero'
        };
    }

    return {
        selections: digits,
        valid: true,
        hadZero,
        normalized: false,
        reason: 'ok'
    };
}

function decodeTalentSelections(codeOrString, options = {}) {
    return parseTalentSelectionsWithStatus(codeOrString, options).selections;
}

function decodeBuildCode(codeOrString, options = {}) {
    return decodeTalentSelections(codeOrString, options);
}

function extractHeroFromBuildCode(codeOrString) {
    const trimmed = String(codeOrString || '').trim();
    const match = trimmed.match(/^\[?T[0-6]{7},([^\]]+)\]?$/i);
    return match ? match[1].trim() : '';
}


// ==========================================
// 4. BUILDER URL QUERY HELPERS
// ==========================================

function parseBuilderQuery(searchOrUrl = '') {
    let rawSearch = '';

    if (typeof searchOrUrl === 'string' && searchOrUrl.trim()) {
        try {
            const urlObj = searchOrUrl.includes('://') || searchOrUrl.startsWith('?') || searchOrUrl.startsWith('#')
                ? new URL(searchOrUrl, window.location.href)
                : new URL(`?${searchOrUrl.replace(/^\?/, '')}`, window.location.href);
            rawSearch = urlObj.search || '';
            if (!rawSearch && urlObj.hash && urlObj.hash.includes('?')) {
                rawSearch = urlObj.hash.slice(urlObj.hash.indexOf('?'));
            }
        } catch (_) {
            rawSearch = searchOrUrl.startsWith('?') ? searchOrUrl : `?${searchOrUrl}`;
        }
    } else if (typeof window !== 'undefined' && window.location) {
        rawSearch = window.location.search || '';
        if (!rawSearch && window.location.hash && window.location.hash.includes('?')) {
            rawSearch = window.location.hash.slice(window.location.hash.indexOf('?'));
        }
    }

    const params = new URLSearchParams(rawSearch);
    const hero = (params.get('hero') || '').trim();
    const rawCode = (params.get('build') || params.get('talents') || params.get('code') || '').trim();
    const parsedMeta = rawCode ? parseTalentSelectionsWithStatus(rawCode, { allowZero: true }) : null;

    return {
        hero,
        rawCode,
        selections: parsedMeta ? parsedMeta.selections : null,
        valid: parsedMeta ? parsedMeta.valid : !rawCode,
        hadZero: parsedMeta ? parsedMeta.hadZero : false,
        parseStatus: parsedMeta
    };
}

function encodeBuilderQuery(heroId = '', selections = null, baseParams = null) {
    const params = baseParams instanceof URLSearchParams
        ? new URLSearchParams(baseParams.toString())
        : new URLSearchParams();

    const trimmedHero = String(heroId || '').trim();
    if (trimmedHero) {
        params.set('hero', trimmedHero);
    } else {
        params.delete('hero');
    }

    if (Array.isArray(selections) && selections.length === TALENT_TIERS.length) {
        params.set('build', encodeTalentSelections(selections, { allowZero: true }));
    }

    return params;
}

function buildBuilderShareUrl(heroId = '', selections = null, locationObj = null) {
    const loc = locationObj || (typeof window !== 'undefined' ? window.location : null);
    if (!loc) return '';

    const url = new URL(loc.href);
    url.searchParams.set('view', 'builder');

    const trimmedHero = String(heroId || '').trim();
    if (trimmedHero) {
        url.searchParams.set('hero', trimmedHero);
    } else {
        url.searchParams.delete('hero');
    }

    if (Array.isArray(selections) && selections.length === TALENT_TIERS.length) {
        url.searchParams.set('build', encodeTalentSelections(selections, { allowZero: true }));
    }

    return url.toString();
}
