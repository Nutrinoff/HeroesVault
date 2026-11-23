// ==========================================
// HEROESVAULT SHARED DOM & UTILITY MODULE
// ==========================================

(function initHeroesVaultDom(global) {
    'use strict';

    const DEFAULT_ALLOWED_TAGS = new Set([
        'DIV', 'P', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'BR',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
        'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'IMG'
    ]);

    const BLOCKED_TAGS = new Set([
        'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON'
    ]);

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isSafeUrl(rawUrl, { allowDataImage = false } = {}) {
        const val = String(rawUrl ?? '').trim();
        if (!val) return false;

        if (allowDataImage && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(val)) {
            return true;
        }

        try {
            const base = global.location && global.location.origin ? global.location.origin : 'https://localhost';
            const parsed = new URL(val, base);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    function sanitizeUrl(rawUrl, options = {}) {
        if (!isSafeUrl(rawUrl, options)) return '';
        const val = String(rawUrl ?? '').trim();
        if (options.allowDataImage && /^data:image\//i.test(val)) {
            return val;
        }
        try {
            const base = global.location && global.location.origin ? global.location.origin : 'https://localhost';
            return new URL(val, base).href;
        } catch (_) {
            return '';
        }
    }

    function sanitizeHtml(rawHtml, { allowedTags = DEFAULT_ALLOWED_TAGS } = {}) {
        const htmlStr = String(rawHtml ?? '');
        if (!htmlStr.trim()) return '';

        if (typeof global.DOMParser === 'undefined') {
            return escapeHtml(htmlStr);
        }

        const doc = new global.DOMParser().parseFromString(htmlStr, 'text/html');
        const body = doc.body;
        if (!body) return '';

        const walk = node => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === 8 /* Node.COMMENT_NODE */) {
                    child.remove();
                    continue;
                }
                if (child.nodeType !== 1 /* Node.ELEMENT_NODE */) {
                    continue;
                }

                const tag = child.tagName.toUpperCase();
                if (BLOCKED_TAGS.has(tag)) {
                    child.remove();
                    continue;
                }

                if (!allowedTags.has(tag)) {
                    const parent = child.parentNode;
                    if (parent) {
                        walk(child);
                        while (child.firstChild) {
                            parent.insertBefore(child.firstChild, child);
                        }
                        child.remove();
                    }
                    continue;
                }

                for (const attr of Array.from(child.attributes)) {
                    const attrName = attr.name.toLowerCase();
                    if (attrName.startsWith('on') || attrName === 'srcdoc') {
                        child.removeAttribute(attr.name);
                        continue;
                    }

                    if (attrName === 'href') {
                        const safeHref = sanitizeUrl(attr.value, { allowDataImage: false });
                        if (safeHref) {
                            child.setAttribute('href', safeHref);
                            if (tag === 'A') {
                                child.setAttribute('rel', 'noopener noreferrer');
                            }
                        } else {
                            child.removeAttribute('href');
                        }
                        continue;
                    }

                    if (attrName === 'src') {
                        const safeSrc = sanitizeUrl(attr.value, { allowDataImage: true });
                        if (safeSrc) {
                            child.setAttribute('src', safeSrc);
                        } else {
                            child.removeAttribute('src');
                        }
                    }
                }

                walk(child);
            }
        };

        walk(body);
        return body.innerHTML;
    }

    function attachImageFallback(imgEl, fallbackUrl) {
        if (!imgEl || !fallbackUrl) return;
        const safeFallback = sanitizeUrl(fallbackUrl, { allowDataImage: true }) || fallbackUrl;

        const onError = () => {
            imgEl.removeEventListener('error', onError);
            if (imgEl.getAttribute('src') !== safeFallback) {
                imgEl.setAttribute('src', safeFallback);
            }
        };

        imgEl.removeEventListener('error', onError);
        imgEl.addEventListener('error', onError);
    }

    async function copyTextWithFallback(text) {
        const value = String(text ?? '');
        if (!value) return false;

        if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
            try {
                await global.navigator.clipboard.writeText(value);
                return true;
            } catch (_) {
                // Fall back to execCommand below
            }
        }

        const doc = global.document;
        if (!doc || !doc.body) return false;

        const textarea = doc.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';

        doc.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        let copied = false;
        try {
            if (typeof doc.execCommand === 'function') {
                copied = Boolean(doc.execCommand('copy'));
            }
        } catch (_) {
            copied = false;
        } finally {
            textarea.remove();
        }

        return copied;
    }

    global.HeroesVaultDom = {
        escapeHtml,
        isSafeUrl,
        sanitizeUrl,
        sanitizeHtml,
        attachImageFallback,
        copyTextWithFallback
    };
})(window);
