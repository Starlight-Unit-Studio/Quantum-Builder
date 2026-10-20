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
  const MAX_GROUPS = 12;
  const MAX_NODES = MAX_ITEMS + MAX_GROUPS;
  const MAX_GROUP_DEPTH = 3;
  const bytes = (value) => new TextEncoder().encode(value).length;
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isGroup = (item) => Boolean(item && typeof item === 'object' && item.type === 'group');
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
    const ids = new Set();
    let nodeCount = 0;
    let linkCount = 0;
    let groupCount = 0;
    const visit = (list, parentPath = [], groupDepth = 0) => {
      if (!Array.isArray(list)) throw new Error('Die Einträge einer Gruppe müssen ein JSON-Array sein.');
      if (list.length > MAX_NODES) throw new Error(`Maximal ${MAX_NODES} Menüelemente sind möglich.`);
      return list.map((item, index) => {
        const path = [...parentPath, index];
        try {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('Ein Menüeintrag muss ein Ziel oder eine Gruppe sein.');
          }
          if (++nodeCount > MAX_NODES) throw new Error(`Maximal ${MAX_NODES} Menüelemente sind möglich.`);
          if (item.type !== undefined && item.type !== 'link' && item.type !== 'group') {
            throw new Error('Der Menütyp muss link oder group sein.');
          }
          if (typeof item.label !== 'string' || !item.label.trim() || bytes(item.label.trim()) > 80) {
            throw new Error('Die Beschriftung darf nicht leer sein und maximal 80 UTF-8-Bytes enthalten.');
          }
          let normalized;
          if (isGroup(item)) {
            if (++groupCount > MAX_GROUPS) throw new Error(`Maximal ${MAX_GROUPS} Gruppen sind möglich.`);
            if (groupDepth >= MAX_GROUP_DEPTH) throw new Error(`Maximal ${MAX_GROUP_DEPTH} Gruppenebenen sind möglich.`);
            if (owns(item, 'url')) throw new Error('Eine Gruppe darf keine Ziel-URL enthalten.');
            if (typeof item.id !== 'string' || item.id !== item.id.trim() || !/^[a-z][a-z0-9_-]{0,39}$/.test(item.id)) {
              throw new Error('Die Gruppen-ID muss mit einem Kleinbuchstaben beginnen und darf nur Kleinbuchstaben, Ziffern, _ und - enthalten (maximal 40 Zeichen).');
            }
            if (ids.has(item.id)) throw new Error('Jede Gruppe braucht eine eindeutige ID.');
            ids.add(item.id);
            if (owns(item, 'collapsed') && typeof item.collapsed !== 'boolean') {
              throw new Error('Der Einklappzustand muss true oder false sein.');
            }
            normalized = {
              type: 'group', id: item.id, label: item.label.trim(),
              collapsed: item.collapsed === true,
              children: visit(item.children, path, groupDepth + 1),
            };
          } else {
            if (++linkCount > MAX_ITEMS) throw new Error(`Maximal ${MAX_ITEMS} Menüziele sind möglich.`);
            if (['children', 'id', 'collapsed'].some((key) => owns(item, key))) {
              throw new Error('Ein Menüziel darf keine Gruppenfelder enthalten.');
            }
            if (typeof item.url !== 'string') throw new Error('Das Menüziel muss Text sein.');
            resolveTarget(item.url, context);
            normalized = { label: item.label.trim(), url: item.url.trim() };
          }
          for (const field of ['icon', 'active_icon']) {
            const value = icons.validate(item[field]);
            if (value) normalized[field] = value;
          }
          return normalized;
        } catch (cause) {
          if (cause.itemPath) throw cause;
          const error = new Error(`Menüeintrag ${path.map((part) => part + 1).join('.')}: ${cause.message}`);
          error.itemPath = path;
          error.itemIndex = path[0];
          throw error;
        }
      });
    };
    return visit(items);
  };

  // Structural traversal is also useful for incomplete editor drafts. It never
  // validates or normalizes labels/URLs and remains bounded on cyclic input.
  const walkItems = (items) => {
    const result = [];
    const visit = (list, parentPath = [], ancestors = []) => {
      if (!Array.isArray(list)) throw new Error('Eine Menüliste muss ein Array sein.');
      if (list.length > MAX_NODES) throw new Error('Die Menüstruktur ist zu groß.');
      list.forEach((item, index) => {
        const path = [...parentPath, index];
        if (!item || typeof item !== 'object' || Array.isArray(item) || result.length >= MAX_NODES) {
          throw new Error('Die Menüstruktur ist ungültig oder zu groß.');
        }
        result.push({ item, path, depth: ancestors.length, parentId: ancestors.at(-1)?.id || null, ancestors: [...ancestors] });
        if (isGroup(item)) {
          if (ancestors.length >= MAX_GROUP_DEPTH) throw new Error('Die Menüstruktur ist zu tief.');
          visit(item.children, path, [...ancestors, item]);
        }
      });
    };
    visit(items);
    return result;
  };
  const flattenItems = (items) => walkItems(items).filter(({ item }) => !isGroup(item)).map(({ item }) => item);

  return Object.freeze({ MAX_ITEMS, MAX_TABS, MAX_GROUPS, MAX_NODES, MAX_GROUP_DEPTH, isGroup, validateItems, resolveTarget, walkItems, flattenItems });
});
