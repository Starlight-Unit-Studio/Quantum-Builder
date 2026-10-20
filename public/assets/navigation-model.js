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
  const MAX_MENUS = 4;
  const MAX_RULES = 16;
  const MAX_TOTAL_NODES = 24;
  const SURFACES = Object.freeze(['top_bar', 'sidebar', 'bottom_tabs', 'contextual_toolbar']);
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

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = (value) => typeof value === 'string' && value === value.trim() && /^[a-z][a-z0-9_-]{0,39}$/.test(value);
  const validHost = (value) => typeof value === 'string' && value.length <= 253
    && value === value.trim() && value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  const isTrustedHost = (host, trusted) => host === trusted || host.endsWith('.' + trusted);
  const trustedHost = (context) => String(context.trustedDomain || parseHttps(String(context.startUrl || '').trim()).hostname).trim().toLowerCase();
  const onlyKeys = (value, keys, message) => {
    if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(message);
  };

  const validateNavigation = (source, context = {}) => {
    if (!isObject(source)) throw new Error('Die Navigation muss ein JSON-Objekt sein.');
    const result = { ...source, items: validateItems(owns(source, 'items') ? source.items : [], context) };
    for (const surface of SURFACES) {
      if (owns(source, surface) && typeof source[surface] !== 'boolean') {
        throw new Error('Die Standard-Sichtbarkeit muss true oder false sein.');
      }
      result[surface] = source[surface] === true;
    }
    const menus = owns(source, 'menus') ? source.menus : [];
    if (!Array.isArray(menus) || menus.length >= MAX_MENUS) throw new Error('Bis zu drei zusätzliche Menüs sind möglich.');
    const ids = new Set(['default']);
    let totalNodes = walkItems(result.items).length;
    result.menus = menus.map((menu, index) => {
      try {
        if (!isObject(menu)) throw new Error('Ein Menü muss ein JSON-Objekt sein.');
        onlyKeys(menu, ['id', 'label', 'items'], 'Ein Menü darf nur id, label und items enthalten.');
        if (!validId(menu.id) || ids.has(menu.id)) throw new Error('Jedes Menü braucht eine eindeutige ID; default ist reserviert.');
        if (typeof menu.label !== 'string' || !menu.label.trim() || bytes(menu.label.trim()) > 80) {
          throw new Error('Der Menüname muss 1 bis 80 UTF-8-Bytes enthalten.');
        }
        ids.add(menu.id);
        const items = validateItems(menu.items, context);
        totalNodes += walkItems(items).length;
        return { id: menu.id, label: menu.label.trim(), items };
      } catch (cause) {
        const error = new Error(`Menü ${index + 1}: ${cause.message}`);
        error.menuIndex = index;
        throw error;
      }
    });
    if (totalNodes > MAX_TOTAL_NODES) throw new Error(`Alle Menüs zusammen dürfen maximal ${MAX_TOTAL_NODES} Ziele und Gruppen enthalten.`);
    const reference = (value) => {
      if (typeof value !== 'string' || !ids.has(value)) throw new Error('Die Menüauswahl verweist auf kein vorhandenes Menü.');
      return value;
    };
    for (const field of ['sidebar_menu', 'bottom_tabs_menu']) result[field] = reference(owns(source, field) ? source[field] : 'default');
    const rules = owns(source, 'rules') ? source.rules : [];
    if (!Array.isArray(rules) || rules.length > MAX_RULES) throw new Error(`Maximal ${MAX_RULES} URL-Regeln sind möglich.`);
    result.rules = rules.map((rule, index) => {
      try {
        if (!isObject(rule)) throw new Error('Eine Regel muss ein JSON-Objekt sein.');
        onlyKeys(rule, ['match', 'path', 'host', 'sidebar_menu', 'bottom_tabs_menu', 'visibility'], 'Die URL-Regel enthält unbekannte Felder.');
        if (!['exact', 'prefix'].includes(rule.match)) throw new Error('Die Pfadregel muss exact oder prefix verwenden.');
        if (typeof rule.path !== 'string' || rule.path.length > 2048 || !rule.path.startsWith('/')
          || rule.path.startsWith('//') || !/^\/(?:[a-z0-9\-._~!$&'()*+,;=:@/]|%[a-f0-9]{2})*$/i.test(rule.path)
          || rule.path !== rule.path.trim()) {
          throw new Error('Der Regelpfad muss mit / beginnen und ein URL-Pfad ohne Abfrage oder Fragment sein; Sonderzeichen bitte als %HH kodieren.');
        }
        const normalized = { match: rule.match, path: rule.path };
        if (owns(rule, 'host')) {
          if (!validHost(rule.host)) throw new Error('Die Regeldomain muss ein gültiger Domainname ohne Port oder Platzhalter sein.');
          const host = rule.host.toLowerCase();
          const trusted = trustedHost(context);
          if (!validHost(trusted) || !isTrustedHost(host, trusted)) throw new Error('Die Regeldomain muss innerhalb der Trusted Domain liegen.');
          normalized.host = host;
        }
        for (const field of ['sidebar_menu', 'bottom_tabs_menu']) if (owns(rule, field)) normalized[field] = reference(rule[field]);
        if (owns(rule, 'visibility')) {
          if (!isObject(rule.visibility) || !Object.keys(rule.visibility).length) throw new Error('Die Sichtbarkeitsregel braucht mindestens einen Bereich.');
          onlyKeys(rule.visibility, SURFACES, 'Unbekannter Bereich in der Sichtbarkeitsregel.');
          normalized.visibility = {};
          for (const [surface, visible] of Object.entries(rule.visibility)) {
            if (typeof visible !== 'boolean') throw new Error('Die Sichtbarkeit muss true oder false sein.');
            normalized.visibility[surface] = visible;
          }
        }
        if (!owns(normalized, 'sidebar_menu') && !owns(normalized, 'bottom_tabs_menu') && !owns(normalized, 'visibility')) {
          throw new Error('Eine Regel muss mindestens ein Menü oder eine Sichtbarkeit ändern.');
        }
        return normalized;
      } catch (cause) {
        const error = new Error(`URL-Regel ${index + 1}: ${cause.message}`);
        error.ruleIndex = index;
        throw error;
      }
    });
    return result;
  };

  // Match raw paths just as java.net.URI.getRawPath() does. WHATWG URL.pathname
  // would normalize dot segments and make the preview disagree with Android.
  const routeLocation = (url, context) => {
    if (typeof url !== 'string') return null;
    if (url.indexOf('#') !== url.lastIndexOf('#')) return null;
    // Use one explicit URI character boundary across browsers and Android.
    // URI accepts raw brackets in queries; WHATWG URL accepts raw backticks
    // and C1 controls. Neither should create a preview/runtime rule mismatch.
    if (/[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff\\<>"{}|^\[\]\x60]/u.test(url)) return null;
    try {
      const parsed = parseHttps(url);
      const host = parsed.hostname.toLowerCase();
      const trusted = trustedHost(context);
      if (!validHost(host) || !validHost(trusted) || !isTrustedHost(host, trusted)) return null;
      const match = /^https:\/\/[^/?#]+(\/[^?#]*)?(?:[?#]|$)/i.exec(url);
      return match ? { host, path: match[1] || '/' } : null;
    } catch { return null; }
  };
  const selectNavigation = (navigation, currentUrl, context = {}) => {
    const result = { ...navigation, matchedRuleIndex: -1 };
    const location = routeLocation(currentUrl, context);
    if (location) {
      const index = (navigation.rules || []).findIndex((rule) => (!rule.host || rule.host === location.host)
        && (rule.match === 'exact' ? location.path === rule.path
          : location.path === rule.path || location.path.startsWith(rule.path.endsWith('/') ? rule.path : rule.path + '/')));
      if (index >= 0) {
        const rule = navigation.rules[index];
        for (const field of ['sidebar_menu', 'bottom_tabs_menu']) if (owns(rule, field)) result[field] = rule[field];
        Object.assign(result, rule.visibility || {});
        result.matchedRuleIndex = index;
      }
    }
    const findMenu = (id) => id === 'default' ? navigation.items : navigation.menus?.find((menu) => menu.id === id)?.items;
    result.sidebar_menu = result.sidebar_menu || 'default';
    result.bottom_tabs_menu = result.bottom_tabs_menu || 'default';
    result.items = findMenu(result.sidebar_menu) || [];
    result.tabItems = findMenu(result.bottom_tabs_menu) || [];
    return result;
  };

  return Object.freeze({ MAX_ITEMS, MAX_TABS, MAX_GROUPS, MAX_NODES, MAX_GROUP_DEPTH,
    MAX_MENUS, MAX_RULES, MAX_TOTAL_NODES, SURFACES,
    isGroup, validateItems, validateNavigation, selectNavigation, resolveTarget, walkItems, flattenItems });
});
