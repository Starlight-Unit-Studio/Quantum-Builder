(() => {
  'use strict';

  const create = ({ root, rulesRoot, additionalRoot, defaultPanel, defaultRoot, defaultTextarea, textarea, getContext = () => ({}) }) => {
    const model = window.QuantumNavigationModel;
    const editors = window.QuantumNavigationEditor;
    if (!model || !editors || !root || !rulesRoot || !additionalRoot || !defaultPanel || !textarea) {
      throw new Error('Navigation menu editor requires its model, panels and JSON fields.');
    }
    const maxMenus = model.MAX_MENUS || 4;
    const maxRules = model.MAX_RULES || 16;
    const maxNodes = model.MAX_TOTAL_NODES || 24;
    const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
    const surfaces = [ ['top_bar', 'Top Bar'], ['sidebar', 'Sidebar'], ['bottom_tabs', 'Bottom Tabs'], ['contextual_toolbar', 'Contextual Toolbar'] ];
    let profile = { menus: [], sidebar_menu: 'default', bottom_tabs_menu: 'default', rules: [] };
    let selected = 'default';
    let currentSource = '';
    let sourceError = '';
    let writing = false;
    let destroyed = false;
    let sequence = 0;
    const instances = new Map();
    const ruleRows = new Map();

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const button = (text, id, className = '') => {
      const node = el('button', 'btn compact ' + className, text);
      node.type = 'button';
      if (id) node.id = id;
      return node;
    };
    const field = (text, control) => {
      const label = el('label', 'qb-nav-menus__field');
      label.append(el('span', 'field-label', text), control);
      return label;
    };
    const input = (id, placeholder = '') => {
      const node = el('input', 'field');
      if (id) node.id = id;
      node.placeholder = placeholder;
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); node.blur(); }
      });
      return node;
    };
    const select = id => {
      const node = el('select', 'field');
      if (id) node.id = id;
      return node;
    };
    const options = (node, entries, value) => {
      const values = entries.map(([value]) => String(value));
      if (!values.includes(String(value))) entries = [...entries, [String(value), 'Ungültige Auswahl']];
      node.replaceChildren(...entries.map(([key, label]) => {
        const option = el('option', '', label);
        option.value = String(key);
        return option;
      }));
      node.value = String(value);
    };
    const menuOptions = () => [['default', 'Standardmenü'], ...profile.menus.map(menu => [menu.id, menu.label.trim() || 'Unbenanntes Menü'])];
    const managed = node => { node.dataset.navigationManaged = 'true'; };
    [root, rulesRoot, additionalRoot, defaultRoot].forEach(managed);
    root.classList.add('qb-nav-menus');
    rulesRoot.classList.add('qb-nav-rules');

    const header = el('div', 'qb-nav-menus__header');
    header.append(el('h4', '', 'Menüs und Zuordnung'));
    const count = el('span', 'qb-nav-editor__count');
    header.append(count);
    const menuSelect = select('nativeNavigationMenuSelect');
    const addMenu = button('+ Menü', 'nativeNavigationAddMenu', 'primary');
    addMenu.setAttribute('aria-label', 'Menü hinzufügen');
    const chooser = el('div', 'qb-nav-menus__chooser');
    chooser.append(field('Menü bearbeiten', menuSelect), addMenu);
    const menuName = input('nativeNavigationMenuLabel', 'Menüname');
    menuName.maxLength = 80;
    const removeMenu = button('Menü entfernen', 'nativeNavigationDeleteMenu', 'qb-nav-menus__remove');
    const editName = el('div', 'qb-nav-menus__chooser');
    editName.append(field('Name dieses Menüs', menuName), removeMenu);
    const deleteHelp = el('p', 'qb-nav-editor__help');
    deleteHelp.id = 'nativeNavigationMenuDeleteHelp';
    const defaults = el('div', 'qb-nav-menus__grid');
    const sidebarMenu = select('nativeSidebarMenu');
    const tabsMenu = select('nativeBottomTabsMenu');
    defaults.append(field('Standardmenü der Sidebar', sidebarMenu), field('Standardmenü der Bottom Tabs', tabsMenu));
    const message = el('p', 'qb-nav-editor__error');
    message.id = 'nativeNavigationMenusError';
    message.setAttribute('role', 'status');
    message.hidden = true;
    root.replaceChildren(header, chooser, editName, deleteHelp, defaults,
      el('p', 'qb-nav-editor__help', `Bis zu ${maxMenus} Menüs mit insgesamt ${maxNodes} Zielen und Gruppen. Sidebar und Tabs können unterschiedliche Menüs verwenden. Leere Menüs zeigen Home.`), message);

    const rulesHeader = el('div', 'qb-nav-menus__header');
    const ruleCount = el('span', 'qb-nav-editor__count');
    const ruleHeading = el('div', 'qb-nav-editor__heading');
    ruleHeading.append(el('h4', '', 'Menüs und Sichtbarkeit nach URL'), ruleCount);
    const addRule = button('+ URL-Regel', 'nativeNavigationAddRule');
    rulesHeader.append(ruleHeading, addRule);
    const ruleList = el('div', 'qb-nav-rules__list');
    const rulesEmpty = el('p', 'qb-nav-editor__empty', 'Ohne URL-Regeln gelten die Standardmenüs und die Sichtbarkeitsschalter oben auf jeder Seite.');
    rulesRoot.replaceChildren(rulesHeader,
      el('p', 'qb-nav-editor__help', 'Die erste passende Regel entscheidet. Nicht geänderte Werte kommen aus den Standardeinstellungen. „Anzeigen“ kann einen oben ausgeschalteten Bereich auf dieser Seite einschalten.'),
      el('p', 'qb-nav-editor__help', 'Pfadpräfix /shop gilt für /shop und dessen Unterseiten, nicht für /shopping. Suchparameter und #Anker werden ignoriert. Optional gilt eine Regel nur für die exakt angegebene vertrauenswürdige Domain.'),
      ruleList, rulesEmpty);

    const defaultEditor = editors.create({ root: defaultRoot, textarea: defaultTextarea, getContext });
    const read = () => {
      if (sourceError) throw new Error(sourceError);
      for (const instance of instances.values()) {
        if (instance.draftError) throw new Error(`${instance.menu.label.trim() || 'Unbenanntes Menü'}: ${instance.draftError}`);
      }
      const parsed = JSON.parse(textarea.value.trim() || '{}');
      if (!isObject(parsed)) throw new Error('Menüs und URL-Regeln müssen ein JSON-Objekt sein.');
      if (Object.keys(parsed).some(key => !['menus', 'sidebar_menu', 'bottom_tabs_menu', 'rules'].includes(key))) {
        throw new Error('Dieses JSON-Feld enthält nur menus, sidebar_menu, bottom_tabs_menu und rules.');
      }
      return parsed;
    };
    const references = id => {
      const refs = [];
      if (profile.sidebar_menu === id) refs.push('Standardmenü der Sidebar');
      if (profile.bottom_tabs_menu === id) refs.push('Standardmenü der Bottom Tabs');
      profile.rules.forEach((rule, index) => {
        if (rule.sidebar_menu === id || rule.bottom_tabs_menu === id) refs.push(`URL-Regel ${index + 1}`);
      });
      return refs;
    };
    const refreshSelection = () => {
      const menu = profile.menus.find(menu => menu.id === selected);
      defaultPanel.hidden = selected !== 'default';
      for (const [id, instance] of instances) instance.panel.hidden = id !== selected;
      editName.hidden = !menu;
      deleteHelp.hidden = !menu;
      if (menu) {
        if (menuName.value !== menu.label) menuName.value = menu.label;
        const used = references(menu.id);
        deleteHelp.textContent = used.length
          ? `Verwendet als ${used.join(', ')}. Zum Entfernen bitte zuerst diese Zuordnungen ändern.`
          : 'Dieses Menü wird derzeit keiner Sidebar, Tab-Leiste oder URL-Regel zugeordnet.';
      }
    };
    const refreshOptions = () => {
      const entries = menuOptions();
      options(menuSelect, entries, selected);
      options(sidebarMenu, entries, profile.sidebar_menu);
      options(tabsMenu, entries, profile.bottom_tabs_menu);
      for (const [rule, row] of ruleRows) {
        for (const key of ['sidebar_menu', 'bottom_tabs_menu']) {
          options(row.fields[key], [['', 'Standardeinstellung'], ...entries], owns(rule, key) ? rule[key] : '');
        }
      }
      refreshSelection();
    };
    const refreshValidation = () => {
      defaultEditor.refreshValidation();
      for (const instance of instances.values()) instance.editor.refreshValidation();
      let error = sourceError;
      let total = 0;
      if (!error) {
        try {
          const value = read();
          const items = JSON.parse(defaultTextarea.value.trim() || '[]');
          const normalized = model.validateNavigation({ ...value, items }, getContext());
          total = model.walkItems(normalized.items).length;
          for (const menu of normalized.menus) total += model.walkItems(menu.items).length;
        } catch (cause) { error = cause.message || 'Menüs und URL-Regeln bitte prüfen.'; }
      }
      message.textContent = error;
      message.hidden = !error;
      textarea.setAttribute('aria-invalid', error ? 'true' : 'false');
      count.textContent = error ? `${profile.menus.length + 1} / ${maxMenus} Menüs` : `${profile.menus.length + 1} / ${maxMenus} Menüs · ${total} / ${maxNodes} Elemente`;
      ruleCount.textContent = `${profile.rules.length} / ${maxRules}`;
      addMenu.disabled = Boolean(sourceError) || profile.menus.length >= maxMenus - 1;
      addRule.disabled = Boolean(sourceError) || profile.rules.length >= maxRules;
      [menuName, removeMenu, sidebarMenu, tabsMenu].forEach(control => { control.disabled = Boolean(sourceError); });
      for (const instance of instances.values()) instance.panel.disabled = Boolean(sourceError);
      ruleList.querySelectorAll('input, select, button').forEach(control => { control.disabled = Boolean(sourceError); });
      [...profile.rules].forEach((rule, index) => {
        const row = ruleRows.get(rule);
        if (!row) return;
        row.up.disabled = Boolean(sourceError) || index === 0;
        row.down.disabled = Boolean(sourceError) || index === profile.rules.length - 1;
      });
      refreshSelection();
      return !error;
    };
    const write = () => {
      if (sourceError || destroyed) return;
      textarea.value = JSON.stringify(profile, null, 2);
      currentSource = textarea.value;
      writing = true;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      writing = false;
      refreshValidation();
    };

    const buildExtra = menu => {
      const panel = el('fieldset', 'qb-nav-menu-panel');
      panel.dataset.navigationMenuPanel = menu.id;
      const legend = el('legend', 'qb-nav-editor__live', menu.label || 'Menü');
      const editorRoot = el('div');
      editorRoot.dataset.navigationMenuEditor = menu.id;
      const advanced = el('details', 'qb-nav-advanced');
      advanced.append(el('summary', '', 'Erweitert: dieses Menü als JSON bearbeiten'));
      const raw = el('textarea', 'field mono');
      raw.rows = 9;
      raw.spellcheck = false;
      raw.dataset.navigationMenuJson = menu.id;
      raw.value = JSON.stringify(menu.items, null, 2);
      advanced.append(field('Menüliste', raw));
      panel.append(legend, editorRoot, advanced);
      additionalRoot.append(panel);
      const instance = { menu, panel, raw, legend, draftError: '', lastSource: raw.value };
      instance.editor = editors.create({ root: editorRoot, textarea: raw, getContext });
      const changed = event => {
        event.stopPropagation();
        if (destroyed || instances.get(menu.id) !== instance || raw.value === instance.lastSource) return;
        instance.lastSource = raw.value;
        instance.draftError = '';
        try { menu.items = JSON.parse(raw.value.trim() || '[]'); }
        catch { instance.draftError = 'Die Menü-JSON ist noch unvollständig. Der Entwurf bleibt auch beim Menüwechsel erhalten.'; }
        write();
      };
      raw.addEventListener('input', changed);
      raw.addEventListener('change', changed);
      instances.set(menu.id, instance);
    };

    const renderRules = () => {
      const existing = new Set(profile.rules);
      for (const [rule, row] of ruleRows) if (!existing.has(rule)) { row.node.remove(); ruleRows.delete(rule); }
      profile.rules.forEach((rule, index) => {
        let row = ruleRows.get(rule);
        if (!row) {
          const node = el('div', 'qb-nav-rule');
          const header = el('div', 'qb-nav-menus__header');
          const title = el('h5');
          const actions = el('div', 'qb-nav-rule__actions');
          const up = button('↑');
          const down = button('↓');
          const remove = button('Entfernen', null, 'qb-nav-menus__remove');
          up.dataset.navigationRuleAction = 'up';
          down.dataset.navigationRuleAction = 'down';
          remove.dataset.navigationRuleAction = 'remove';
          actions.append(up, down, remove);
          header.append(title, actions);
          const matchGrid = el('div', 'qb-nav-menus__grid');
          const match = select();
          options(match, [['prefix', 'Pfad und Unterseiten'], ['exact', 'Genau dieser Pfad']], rule.match ?? '');
          const path = input(null, '/shop');
          path.value = typeof rule.path === 'string' ? rule.path : '';
          path.maxLength = 2048;
          path.spellcheck = false;
          const host = input(null, 'Alle vertrauenswürdigen Domains');
          host.value = typeof rule.host === 'string' ? rule.host : '';
          host.spellcheck = false;
          host.autocapitalize = 'none';
          matchGrid.append(field('Übereinstimmung', match), field('URL-Pfad', path), field('Domain, optional', host));
          const fields = { match, path, host };
          const choices = el('div', 'qb-nav-menus__grid');
          for (const [key, title] of [['sidebar_menu', 'Menü der Sidebar'], ['bottom_tabs_menu', 'Menü der Bottom Tabs']]) {
            const control = select();
            fields[key] = control;
            choices.append(field(title, control));
          }
          const visibility = el('fieldset', 'qb-nav-rule__visibility');
          visibility.append(el('legend', 'field-label', 'Sichtbarkeit auf passenden Seiten'));
          for (const [key, title] of surfaces) {
            const control = select();
            const value = isObject(rule.visibility) && owns(rule.visibility, key) ? rule.visibility[key] : '';
            options(control, [['', 'Standardeinstellung'], ['true', 'Anzeigen'], ['false', 'Ausblenden']], value);
            fields['visibility.' + key] = control;
            visibility.append(field(title, control));
          }
          node.append(header, matchGrid, choices, visibility);
          row = { node, title, fields, up, down, remove };
          ruleRows.set(rule, row);
          for (const [key, control] of Object.entries(fields)) {
            control.dataset.navigationRuleField = key;
            const changed = event => {
              event.stopPropagation();
              if (sourceError) return;
              if (key.startsWith('visibility.')) {
                const surface = key.slice(11);
                if (!isObject(rule.visibility)) rule.visibility = {};
                if (control.value === '') delete rule.visibility[surface];
                else rule.visibility[surface] = control.value === 'true';
                if (!Object.keys(rule.visibility).length) delete rule.visibility;
              } else if ((key === 'host' || key.endsWith('_menu')) && control.value === '') delete rule[key];
              else rule[key] = control.value;
              write();
            };
            control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', changed);
            control.addEventListener(control.tagName === 'SELECT' ? 'input' : 'change', event => event.stopPropagation());
          }
          const move = direction => {
            const oldIndex = profile.rules.indexOf(rule);
            const newIndex = oldIndex + direction;
            if (sourceError || oldIndex < 0 || newIndex < 0 || newIndex >= profile.rules.length) return;
            profile.rules.splice(oldIndex, 1);
            profile.rules.splice(newIndex, 0, rule);
            renderRules();
            write();
            (direction < 0 ? up : down).focus();
          };
          up.addEventListener('click', () => move(-1));
          down.addEventListener('click', () => move(1));
          remove.addEventListener('click', () => {
            if (sourceError) return;
            profile.rules.splice(profile.rules.indexOf(rule), 1);
            renderRules();
            write();
            addRule.focus();
          });
        }
        row.node.dataset.navigationRuleIndex = String(index);
        row.title.textContent = `Regel ${index + 1}`;
        row.up.setAttribute('aria-label', `Regel ${index + 1} nach oben verschieben`);
        row.down.setAttribute('aria-label', `Regel ${index + 1} nach unten verschieben`);
        row.remove.setAttribute('aria-label', `Regel ${index + 1} entfernen`);
        if (ruleList.children[index] !== row.node) ruleList.insertBefore(row.node, ruleList.children[index] || null);
      });
      rulesEmpty.hidden = profile.rules.length !== 0;
      refreshOptions();
      refreshValidation();
    };

    const loadProfile = (resetSelection = false) => {
      currentSource = textarea.value;
      sourceError = '';
      // A different app always invalidates old menu/upload ownership, even if
      // its persisted extension is malformed. In-place JSON drafts may retain
      // their previous visual snapshot while the raw source is repaired.
      if (resetSelection) {
        for (const instance of instances.values()) { instance.editor.destroy(); instance.panel.remove(); }
        instances.clear();
        ruleRows.clear();
        ruleList.replaceChildren();
        profile = { menus: [], sidebar_menu: 'default', bottom_tabs_menu: 'default', rules: [] };
        selected = 'default';
      }
      try {
        const parsed = JSON.parse(textarea.value.trim() || '{}');
        if (!isObject(parsed)) throw new Error('Menüs und URL-Regeln müssen ein JSON-Objekt sein.');
        const menus = owns(parsed, 'menus') ? parsed.menus : [];
        const rules = owns(parsed, 'rules') ? parsed.rules : [];
        if (!Array.isArray(menus) || menus.length > maxMenus - 1) throw new Error(`Bitte höchstens ${maxMenus - 1} zusätzliche Menüs als JSON-Array angeben.`);
        if (!Array.isArray(rules) || rules.length > maxRules || rules.some(rule => !isObject(rule))) throw new Error(`Bitte höchstens ${maxRules} URL-Regeln als Array von Objekten angeben.`);
        const ids = new Set(['default']);
        for (const menu of menus) {
          if (!isObject(menu) || typeof menu.id !== 'string' || menu.id !== menu.id.trim() || !/^[a-z][a-z0-9_-]{0,39}$/.test(menu.id) || ids.has(menu.id)) {
            throw new Error('Jedes zusätzliche Menü benötigt eine eindeutige ID aus Kleinbuchstaben, Ziffern, _ oder -. „default“ ist reserviert. Bitte das JSON korrigieren.');
          }
          if (typeof menu.label !== 'string' || !owns(menu, 'items')) throw new Error('Jedes Menü benötigt label als Text und eine items-Liste. Bitte das JSON korrigieren.');
          ids.add(menu.id);
        }
        for (const instance of instances.values()) { instance.editor.destroy(); instance.panel.remove(); }
        instances.clear();
        ruleRows.clear();
        ruleList.replaceChildren();
        profile = { sidebar_menu: 'default', bottom_tabs_menu: 'default', ...parsed, menus, rules };
        if (resetSelection || !ids.has(selected)) selected = 'default';
        for (const menu of profile.menus) buildExtra(menu);
        renderRules();
      } catch (error) {
        sourceError = error instanceof SyntaxError
          ? 'Die JSON für Menüs und URL-Regeln ist noch unvollständig. Bitte im erweiterten Feld korrigieren; der Entwurf bleibt erhalten.'
          : error.message;
      }
      refreshOptions();
      refreshValidation();
    };
    const onProfileInput = () => { if (!writing && textarea.value !== currentSource) loadProfile(); };
    textarea.addEventListener('input', onProfileInput);
    textarea.addEventListener('change', onProfileInput);
    menuSelect.addEventListener('input', event => event.stopPropagation());
    menuSelect.addEventListener('change', event => {
      event.stopPropagation();
      if (menuSelect.value === 'default' || instances.has(menuSelect.value)) selected = menuSelect.value;
      refreshSelection();
    });
    menuName.addEventListener('input', event => {
      event.stopPropagation();
      const menu = profile.menus.find(menu => menu.id === selected);
      if (!menu || sourceError) return;
      menu.label = menuName.value;
      instances.get(menu.id).legend.textContent = menu.label || 'Menü';
      refreshOptions();
      write();
    });
    menuName.addEventListener('change', event => event.stopPropagation());
    for (const [control, key] of [[sidebarMenu, 'sidebar_menu'], [tabsMenu, 'bottom_tabs_menu']]) {
      control.addEventListener('input', event => event.stopPropagation());
      control.addEventListener('change', event => {
        event.stopPropagation();
        if (sourceError) return;
        profile[key] = control.value;
        write();
      });
    }
    addMenu.addEventListener('click', () => {
      if (sourceError || profile.menus.length >= maxMenus - 1) return;
      do { sequence += 1; } while (profile.menus.some(menu => menu.id === `menu-${sequence}`));
      const menu = { id: `menu-${sequence}`, label: `Menü ${profile.menus.length + 2}`, items: [] };
      profile.menus.push(menu);
      buildExtra(menu);
      selected = menu.id;
      refreshOptions();
      write();
      menuName.focus();
      menuName.select();
    });
    removeMenu.addEventListener('click', () => {
      if (sourceError || selected === 'default') return;
      if (references(selected).length) {
        deleteHelp.textContent = `Dieses Menü kann noch nicht entfernt werden. Bitte zuerst ändern: ${references(selected).join(', ')}.`;
        deleteHelp.setAttribute('role', 'status');
        return;
      }
      const instance = instances.get(selected);
      instance?.editor.destroy();
      instance?.panel.remove();
      instances.delete(selected);
      profile.menus = profile.menus.filter(menu => menu.id !== selected);
      selected = 'default';
      refreshOptions();
      write();
      menuSelect.focus();
    });
    addRule.addEventListener('click', () => {
      if (sourceError || profile.rules.length >= maxRules) return;
      const rule = { match: 'prefix', path: '/', sidebar_menu: profile.sidebar_menu };
      profile.rules.push(rule);
      renderRules();
      write();
      ruleRows.get(rule).fields.path.focus();
    });
    loadProfile(true);
    return {
      read,
      refreshValidation,
      load() { defaultEditor.load(); loadProfile(true); },
      destroy() {
        destroyed = true;
        defaultEditor.destroy();
        for (const instance of instances.values()) instance.editor.destroy();
        instances.clear();
        textarea.removeEventListener('input', onProfileInput);
        textarea.removeEventListener('change', onProfileInput);
        root.replaceChildren();
        rulesRoot.replaceChildren();
        additionalRoot.replaceChildren();
      },
    };
  };
  window.QuantumNavigationMenusEditor = Object.freeze({ create });
})();
