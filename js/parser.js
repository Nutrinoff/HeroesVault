// ==========================================
// 1. HERO & TIER LOOKUP
// ==========================================

function normalizeHeroKey(v) {
    return String(v || '')
        .toLowerCase()
        .replace(/['’\.\s\-]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function tierLetter(v) {
    const m = String(v || '').match(/[sabcd]/i);
    return m ? m[0].toUpperCase() : 'D';
}

function getHeroTier(id) {
    const targetKey = normalizeHeroKey(id);
    for (const [k, ids] of Object.entries(MASTER_TIERS || {})) {
        if (Array.isArray(ids) && ids.some(v => normalizeHeroKey(typeof v === 'string' ? v : v.id) === targetKey)) {
            return tierLetter(k);
        }
    }
    return 'D';
}

function resolveHeroMasterData(id) {
    if (!id || !HOTS_MASTER_DATA) return null;
    if (!Array.isArray(HOTS_MASTER_DATA) && HOTS_MASTER_DATA[id]) {
        return HOTS_MASTER_DATA[id];
    }

    const key = normalizeHeroKey(id);
    if (Array.isArray(HOTS_MASTER_DATA)) {
        return HOTS_MASTER_DATA.find(h => {
            if (!h) return false;
            return [h.id, h.hyperlinkId, h.attributeId, h.unitId, h.name]
                .some(v => normalizeHeroKey(v) === key);
        }) || null;
    }

    for (const [k, h] of Object.entries(HOTS_MASTER_DATA)) {
        if (h && [k, h.name, h.hyperlinkId, h.unitId, h.attributeId].some(v => normalizeHeroKey(v) === key)) {
            return h;
        }
    }

    return null;
}


// ==========================================
// 2. ABILITY & TALENT NORMALIZATION
// ==========================================

function normalizeTalentTree(tree) {
    const normalized = {};
    if (tree && typeof tree === 'object') {
        for (const [k, v] of Object.entries(tree)) {
            const tier = String(k).replace(/^Level/i, '').replace(/^\D+/, '');
            if (tier) {
                normalized[tier] = Array.isArray(v) ? v : [];
            }
        }
    }
    return normalized;
}

function abilityEntry(a, category, variant = '', fallbackKey = 'Q') {
    return {
        key: a.abilityType || a.buttonId || fallbackKey || category,
        name: a.name || a.buttonId || category || 'Ability',
        icon: a.icon || '',
        desc: a.fullText || a.shortText || a.description || '',
        category: category || 'Basic',
        variant
    };
}

function flattenHeroAbilities(h) {
    if (!h) return [];
    const out = [];

    const addList = (list, variant = '') => {
        if (!Array.isArray(list)) return;
        list.forEach(a => {
            if (!a || typeof a !== 'object') return;

            const keyUpper = String(a.abilityType || a.buttonId || '').toUpperCase();
            const nameLower = String(a.name || '').toLowerCase();
            const catLower = String(a.category || '').toLowerCase();

            if (['B', 'R', 'HEROIC'].includes(keyUpper) ||
                catLower === 'hearth' ||
                nameLower === 'hearth' ||
                nameLower === 'cancel' ||
                nameLower.includes('cancel') ||
                nameLower === 'dragon scales' ||
                catLower === 'activable' ||
                catLower === 'passive') {
                return;
            }

            const isStandardAbility = ['Q', 'W', 'E', 'TRAIT', 'D', 'Z', 'ACTIVE'].includes(keyUpper) ||
                ['basic', 'trait', 'mount', 'worldbreaker', 'destroyer', 'dragonqueen', 'worgen'].includes(catLower);

            if (isStandardAbility || a.icon) {
                out.push(abilityEntry(a, a.category || 'Basic', variant, 'Q'));
            }
        });
    };

    if (h.abilities) {
        if (Array.isArray(h.abilities)) {
            addList(h.abilities);
        } else if (typeof h.abilities === 'object') {
            ['Basic', 'Trait', 'Mount', 'Activable', 'WorldBreaker', 'Destroyer'].forEach(cat => {
                if (Array.isArray(h.abilities[cat])) {
                    addList(h.abilities[cat], cat);
                }
            });
        }
    }

    const heroIdLower = normalizeHeroKey(h.id || h.name || '');
    const multiStateHeroes = ['deathwing', 'alexstrasza', 'abathur', 'greymane', 'lostvikings', 'samuro'];
    const hasFormsOrUnits = (h.forms && Object.keys(h.forms).length > 0) ||
        (h.heroUnits && Object.keys(h.heroUnits).length > 0) ||
        multiStateHeroes.includes(heroIdLower);

    if (hasFormsOrUnits) {
        if (h.subAbilities && typeof h.subAbilities === 'object') {
            Object.entries(h.subAbilities).forEach(([subKey, subObj]) => {
                const subKeyLower = subKey.toLowerCase();
                const isFormSubAbility = subKeyLower.includes('worldbreaker') ||
                    subKeyLower.includes('destroyer') ||
                    subKeyLower.includes('dragon') ||
                    subKeyLower.includes('moltenflame') ||
                    subKeyLower.includes('darkflight') ||
                    subKeyLower.includes('razorswipe') ||
                    subKeyLower.includes('worgen');

                if (isFormSubAbility && subObj && typeof subObj === 'object') {
                    Object.entries(subObj).forEach(([catName, subList]) => {
                        if (Array.isArray(subList)) {
                            addList(subList, catName);
                        }
                    });
                }
            });
        }

        if (h.forms && typeof h.forms === 'object') {
            Object.entries(h.forms).forEach(([formName, formObj]) => {
                if (formObj?.abilities) {
                    if (Array.isArray(formObj.abilities)) {
                        addList(formObj.abilities, formName);
                    } else if (typeof formObj.abilities === 'object') {
                        Object.values(formObj.abilities).forEach(subList => {
                            if (Array.isArray(subList)) addList(subList, formName);
                        });
                    }
                }
            });
        }

        if (h.heroUnits && typeof h.heroUnits === 'object') {
            Object.entries(h.heroUnits).forEach(([id, u]) => {
                if (u?.abilities) {
                    const unitName = u.name || id;
                    if (Array.isArray(u.abilities)) {
                        addList(u.abilities, unitName);
                    } else if (u.abilities && typeof u.abilities === 'object') {
                        Object.values(u.abilities).forEach(subList => {
                            if (Array.isArray(subList)) addList(subList, unitName);
                        });
                    }
                }
            });
        }
    }

    const seen = new Set();
    const uniqueList = out.filter(a => {
        const sig = `${a.name}|${a.icon}|${a.variant}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });

    const orderWeight = (key, variant) => {
        const k = String(key || '').toUpperCase();
        const v = String(variant || '').toLowerCase();

        let baseScore = 10;
        if (k === 'Q') baseScore = 1;
        else if (k === 'W') baseScore = 2;
        else if (k === 'E') baseScore = 3;
        else if (['TRAIT', 'D'].includes(k)) baseScore = 4;
        else if (k === 'Z') baseScore = 5;

        if (v && v !== 'basic' && v !== 'trait') {
            baseScore += 20;
        }
        return baseScore;
    };

    return uniqueList.sort((a, b) => orderWeight(a.key, a.variant) - orderWeight(b.key, b.variant));
}


// ==========================================
// 3. GAME TEXT FORMATTING
// ==========================================

function formatGameText(value) {
    const source = String(value || '').replace(/<img\b[^>]*\/?>/gi, '');
    if (!source) return '';

    const escapeHtml = s => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const tokenRe = /<\/?(?:c|s)\b[^>]*>|<n\s*\/\s*>|<br\s*\/?>/gi;

    let output = '';
    let cursor = 0;
    const stack = [];
    let match;

    while ((match = tokenRe.exec(source))) {
        const text = escapeHtml(source.slice(cursor, match.index)).replace(/~~([^~]+)~~/g, '<del class="text-slate-500">$1</del>');
        output += text;
        cursor = tokenRe.lastIndex;
        const token = match[0];

        if (/^<n\s*\/\s*>|<br/i.test(token)) {
            output += '<br>';
            continue;
        }
        if (/^<\//.test(token)) {
            const kind = token.slice(2, 3).toLowerCase();
            for (let i = stack.length - 1; i >= 0; i--) {
                const entry = stack.pop();
                output += '</span>';
                if (entry === kind) break;
            }
            continue;
        }

        const kind = token.slice(1, 2).toLowerCase();
        const valMatch = token.match(/\bval\s*=\s*["']([^"']*)["']/i);
        const val = valMatch ? valMatch[1] : '';
        let cls = '';

        if (kind === 'c') {
            if (val === '#TooltipNumbers') cls = 'text-amber-300 font-semibold';
            else if (val === '#ColorGray') cls = 'text-slate-500';
            else if (/^#[0-9a-f]{6}$/i.test(val)) cls = '';
            else if (val === '#TooltipQuest') cls = 'text-amber-300 font-semibold';
            else cls = 'text-sky-200';
        } else {
            cls = /Header/i.test(val) ? 'text-white font-semibold' : 'text-slate-400';
        }

        if (/^#[0-9a-f]{6}$/i.test(val)) {
            output += `<span style="color:${val}">`;
        } else {
            output += `<span${cls ? ` class="${cls}"` : ''}>`;
        }
        stack.push(kind);
    }

    output += escapeHtml(source.slice(cursor)).replace(/~~([^~]+)~~/g, '<del class="text-slate-500">$1</del>');

    while (stack.length) {
        stack.pop();
        output += '</span>';
    }

    return output;
}
