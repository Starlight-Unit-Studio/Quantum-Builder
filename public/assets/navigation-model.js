((root, factory) => {
  'use strict';
  const icons = typeof module === 'object' && module.exports
    ? require('./navigation-icons.js') : root.QuantumNavigationIcons;
  const model = factory(icons);
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.QuantumNavigationModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, (icons) => {
  'use strict';

  const MAX_ITEMS = 12;
  const MAX_TABS = 5;
  const bytes = (value) => new TextEncoder().encode(value).length;
  const hasScheme = (value) => /^[a-z][a-z0-9+.-]*:/i.test(value);
  const invalidUri = (value) => /[\s\\<>"{}|^\[\]\u0000-\u001f\u007f]/u.test(value) || /%(?![\da-f]{2})/i.test(value);

  const parseHttps = (value) => {
    if (!/^https:\/\//i.test(value) || invalidUri(value)) {
      throw new Error('Bitte eine gültige HTTPS-Adresse oder einen relativen Pfad verwenden.');
    }
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Die Adresse ist ungültig.'); }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('HTTPS-Adressen dürfen keine Zugangsdaten enthalten.');
    }
    // Java URI.getHost() rejects escaped hosts; do not preview a URL the runtime drops.
    const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
    if (!authority || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(authority)) {
      throw new Error('Die Domain muss gültig sein; internationale Domains bitte in Punycode angeben.');
    }
    return parsed;
  };

  const resolveTarget = (value, context = {}) => {
    if (typeof value !== 'string') throw new Error('Das Menüziel muss Text sein.');
    const target = value.trim();
    if (!target || bytes(target) > 2048 || invalidUri(target) || target.startsWith('//')) {
      throw new Error('Ein gültiges Menüziel ohne Leerzeichen ist erforderlich (maximal 2048 Bytes).');
    }
    const startUrl = String(context.startUrl || '').trim();
    const base = parseHttps(startUrl);
    const trustedDomain = String(context.trustedDomain || base.hostname).trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(trustedDomain)) throw new Error('Die Trusted Domain ist ungültig.');

    let resolved;
    if (hasScheme(target)) {
      parseHttps(target);
      resolved = target;
    } else if (target.startsWith('#')) {
      resolved = startUrl.split('#', 1)[0] + target;
    } else {
      // Match java.net.URI.resolve(): a query-only reference resolves against
      // the base directory, whereas WHATWG URL would retain the base filename.
      try { resolved = new URL(target.startsWith('?') ? './' + target : target, startUrl).href; }
      catch { throw new Error('Der relative Menüpfad ist ungültig.'); }
    }
    const parsed = parseHttps(resolved);
    const host = parsed.hostname.toLowerCase();
    if (host !== trustedDomain && !host.endsWith('.' + trustedDomain)) {
      throw new Error('Das Menüziel muss innerhalb der Trusted Domain liegen.');
    }
    return resolved;
  };

  const validateItems = (items, context = {}) => {
    if (!Array.isArray(items)) throw new Error('Die Menüliste muss ein JSON-Array sein.');
    if (items.length > MAX_ITEMS) throw new Error(`Maximal ${MAX_ITEMS} Menüeinträge sind möglich.`);
    return items.map((item, index) => {
      try {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error('Ein Menüeintrag benötigt eine Beschriftung und ein Ziel.');
        }
        if (typeof item.label !== 'string' || !item.label.trim() || bytes(item.label.trim()) > 80) {
          throw new Error('Die Beschriftung darf nicht leer sein und maximal 80 UTF-8-Bytes enthalten.');
        }
        if (typeof item.url !== 'string') throw new Error('Das Menüziel muss Text sein.');
        resolveTarget(item.url, context);
        const normalized = { label: item.label.trim(), url: item.url.trim() };
        for (const field of ['icon', 'active_icon']) {
          const value = icons.validate(item[field]);
          if (value) normalized[field] = value;
        }
        return normalized;
      } catch (cause) {
        const error = new Error(`Menüeintrag ${index + 1}: ${cause.message}`);
        error.itemIndex = index;
        throw error;
      }
    });
  };

  return Object.freeze({ MAX_ITEMS, MAX_TABS, validateItems, resolveTarget });
});
