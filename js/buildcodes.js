// ==========================================
// 1. TALENT TIERS & BUILD CODE CONSTANTS
// ==========================================

const TALENT_TIERS = ['1', '4', '7', '10', '13', '16', '20'];
const DEFAULT_TALENT_SELECTIONS = [1, 1, 1, 1, 1, 1, 1];


// ==========================================
// 2. SELECTION NORMALIZATION & ENCODING
// ==========================================

function normalizeTalentSelections(selections) {
    if (!Array.isArray(selections) || selections.length !== TALENT_TIERS.length) {
        return [...DEFAULT_TALENT_SELECTIONS];
    }
    return selections.map(val => {
        const num = Number(val);
        return Number.isInteger(num) && num >= 1 && num <= 6 ? num : 1;
    });
}

function encodeTalentSelections(selections) {
    return normalizeTalentSelections(selections).join('');
}

function encodeBuildCode(selections, heroId = '') {
    const encoded = encodeTalentSelections(selections);
    if (!heroId) return `[T${encoded}]`;
    return `[T${encoded},${String(heroId).trim()}]`;
}


// ==========================================
// 3. BUILD CODE DECODING
// ==========================================

function decodeTalentSelections(codeOrString) {
    const trimmed = String(codeOrString || '').trim();
    if (!trimmed) {
        return [...DEFAULT_TALENT_SELECTIONS];
    }

    const match =
        trimmed.match(/^\[?T([1-6]{7})(?:,[^\]]*)?\]?$/i) ||
        trimmed.match(/^([1-6]{7})$/);

    if (!match) {
        return [...DEFAULT_TALENT_SELECTIONS];
    }

    return match[1].split('').map(digit => Number(digit));
}

function decodeBuildCode(codeOrString) {
    return decodeTalentSelections(codeOrString);
}
