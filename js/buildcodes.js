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
    const code = `[T${encodeTalentSelections(selections)}]`;
    if (!heroId) return code;
    return `[T${encodeTalentSelections(selections)},${String(heroId).trim()}]`;
}


// ==========================================
// 3. BUILD CODE DECODING
// ==========================================

function decodeTalentSelections(codeOrString) {
    const str = String(codeOrString || '');
    const match = str.match(/\[?T(\d{7})(?:,[^\]]*)?\]?/i) || str.match(/\b([1-6]{7})\b/);
    if (!match) {
        return [...DEFAULT_TALENT_SELECTIONS];
    }
    return match[1].split('').map(digit => {
        const num = Number(digit);
        return num >= 1 && num <= 6 ? num : 1;
    });
}

function decodeBuildCode(codeOrString) {
    return decodeTalentSelections(codeOrString);
}
