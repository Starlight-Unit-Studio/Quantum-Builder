(() => {
  'use strict';

  const create = ({ root, textarea, getContext = () => ({}) }) => {
    if (!root || !textarea) throw new Error('Navigation editor requires a root and JSON field.');

    const model = window.QuantumNavigationModel;
    if (!model) throw new Error('Navigation model must load before the editor.');
    const icons = window.QuantumNavigationIcons;
    if (!icons) throw new Error('Navigation icons must load before the editor.');
    const maxItems = model.MAX_ITEMS || 12;
    const maxTabs = model.MAX_TABS || 5;
    const maxGroups = model.MAX_GROUPS || 12;
    const maxDepth = model.MAX_GROUP_DEPTH || 3;
    const maxNodes = model.MAX_NODES || 24;
    let items = [];
    let nextKey = 0;
    let groupSequence = 0;
    let sourceError = '';
    let currentSource = null;
    let serializing = false;
    let dragKey = null;
    let announceTimer = null;
    let generation = 0;
    let destroyed = false;

    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const button = (className, text, label) => {
      const node = element('button', className, text);
      node.type = 'button';
      if (label) node.setAttribute('aria-label', label);
      return node;
    };

    root.classList.add('qb-nav-editor');
    const header = element('div', 'qb-nav-editor__header');
    const heading = element('div', 'qb-nav-editor__heading');
    heading.append(element('h4', '', 'Menüpunkte'));
    const count = element('span', 'qb-nav-editor__count');
    heading.append(count);
    const add = button('btn compact primary qb-nav-editor__add', '+ Menüpunkt', 'Menüpunkt hinzufügen');
    const addGroup = button('btn compact qb-nav-editor__add-group', '+ Gruppe', 'Gruppe hinzufügen');
    const addActions = element('div', 'qb-nav-editor__add-actions');
    addActions.append(add, addGroup);
    header.append(heading, addActions);

    const help = element('p', 'qb-nav-editor__help', 'Ziele und Gruppen bearbeiten. Mit „In Gruppe“ zuordnen; mit den Pfeilen sortieren oder am Griff ziehen.');
    const sourceMessage = element('p', 'qb-nav-editor__error');
    sourceMessage.setAttribute('role', 'status');
    sourceMessage.hidden = true;
    const list = element('div', 'qb-nav-editor__list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Geordnete Navigationsziele');
    const empty = element('p', 'qb-nav-editor__empty', 'Keine eigenen Menüpunkte. Aktivierte Sidebar und Bottom Tabs zeigen dann automatisch Home.');
    const footer = element('p', 'qb-nav-editor__help', `Bis zu ${maxItems} Ziele und ${maxGroups} Gruppen in ${maxDepth} Gruppenebenen. Bottom Tabs: die ersten ${maxTabs} Ziele, auch innerhalb von Gruppen. Gruppenüberschriften sind keine Tabs.`);
    const live = element('div', 'qb-nav-editor__live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    root.replaceChildren(header, help, sourceMessage, list, empty, footer, live);

    const announce = (text) => {
      window.clearTimeout(announceTimer);
      live.textContent = '';
      announceTimer = window.setTimeout(() => { live.textContent = text; }, 30);
    };

    const isGroup = (item) => item.kind === 'group';
    const walk = (nodes = items, parent = null, ancestors = [], path = []) => nodes.flatMap((item, index) => {
      const current = { item, parent, ancestors, path: [...path, index], siblings: nodes, index, depth: ancestors.length };
      return [current, ...(isGroup(item) ? walk(item.children, item, [...ancestors, item], current.path) : [])];
    });
    const find = (key) => walk().find((entry) => entry.item.key === key);
    const contains = (item) => Boolean(find(item.key));
    const itemName = (item, index = 0) => item.label.trim() || `${isGroup(item) ? 'Gruppe' : 'Menüpunkt'} ${index + 1}`;
    const pathName = (ancestors) => ancestors.map((item) => itemName(item)).join(' / ') || 'Hauptebene';
    const groupHeight = (item) => isGroup(item) ? 1 + Math.max(0, ...item.children.map(groupHeight)) : 0;
    const canPlace = (item, parent) => {
      if (!parent) return groupHeight(item) <= maxDepth;
      const destination = find(parent.key);
      if (!destination || !isGroup(parent) || parent === item || destination.ancestors.includes(item)) return false;
      return destination.depth + 1 + groupHeight(item) <= maxDepth;
    };
    const nextGroupId = () => {
      const used = new Set(walk().filter(({ item }) => isGroup(item)).map(({ item }) => item.id));
      do { groupSequence += 1; } while (used.has(`group-${groupSequence}`));
      return `group-${groupSequence}`;
    };
    const iconFields = ['icon', 'active_icon'];
    const profileItem = (item) => {
      const result = { ...item.original, label: item.label };
      if (isGroup(item)) {
        result.type = 'group';
        result.id = item.id;
        result.collapsed = item.collapsed;
        result.children = item.children.map(profileItem);
      } else result.url = item.url;
      for (const field of iconFields) {
        if (item[field] === undefined || item[field] === '') delete result[field];
        else result[field] = item[field];
      }
      return result;
    };
    const newItem = (source) => ({
      key: ++nextKey, original: source, kind: source.type === 'group' ? 'group' : 'link',
      label: source.label || '', url: source.url || '', id: source.id,
      collapsed: source.collapsed === undefined ? false : source.collapsed,
      children: source.type === 'group' ? source.children.map(newItem) : [],
      icon: source.icon, active_icon: source.active_icon,
      uploadVersion: { icon: 0, active_icon: 0 },
      uploading: { icon: false, active_icon: false },
      uploadErrors: { icon: '', active_icon: '' },
    });

    const refreshIconControl = (item, field) => {
      const control = item.row?.icons[field];
      if (!control) return;
      const value = item[field];
      const active = field === 'active_icon';
      const { select, preview, upload, reset, status } = control;
      select.querySelectorAll('[data-current-icon]').forEach((option) => option.remove());
      let normalized = '';
      let valid = true;
      try { normalized = value === undefined ? '' : icons.validate(value); }
      catch { valid = false; }
      if (!valid || normalized.startsWith('data:')) {
        const option = element('option', '', valid ? 'Eigenes PNG' : 'Ungültige Icon-Angabe');
        option.value = valid ? '__custom__' : '__invalid__';
        option.dataset.currentIcon = 'true';
        select.append(option);
        select.value = option.value;
      } else select.value = normalized;

      const effective = active && valid && !normalized ? item.icon : valid ? normalized : '';
      let visual = null;
      try { visual = icons.createElement(effective || '', { className: 'qb-nav-editor__icon-image' }); }
      catch { /* Invalid raw JSON stays editable without creating an image URL. */ }
      preview.replaceChildren(...(visual ? [visual] : [element('span', '', '·')]));
      preview.classList.toggle('is-active', active);
      upload.textContent = item.uploading[field] ? 'PNG wird geprüft …' : 'PNG auswählen';
      reset.disabled = !value && !item.uploading[field] && !item.uploadErrors[field];
      status.textContent = item.uploading[field] ? 'Datei wird geprüft.'
        : active && valid && !normalized ? 'Übernimmt das normale Icon.'
          : valid && normalized.startsWith('data:') ? 'Eigenes PNG, Originalfarben.' : '';
      status.hidden = !status.textContent;
    };

    const updateIcon = (item, field, value) => {
      item.uploadVersion[field] += 1;
      item.uploading[field] = false;
      item.uploadErrors[field] = '';
      item[field] = value;
      refreshIconControl(item, field);
      if (field === 'icon') refreshIconControl(item, 'active_icon');
      serialize();
    };

    const readPng = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Die PNG-Datei konnte nicht gelesen werden.'));
      reader.onload = () => {
        let value;
        try {
          const encoded = String(reader.result).split(',')[1];
          value = icons.validate(`data:image/png;base64,${encoded}`);
        }
        catch (error) { reject(error); return; }
        const image = new Image();
        image.onerror = () => reject(new Error('Diese Datei lässt sich nicht als PNG-Bild öffnen.'));
        image.onload = () => {
          if (image.naturalWidth < 1 || image.naturalHeight < 1
            || image.naturalWidth > icons.MAX_PNG_DIMENSION || image.naturalHeight > icons.MAX_PNG_DIMENSION) {
            reject(new Error(`PNG-Icons dürfen höchstens ${icons.MAX_PNG_DIMENSION} × ${icons.MAX_PNG_DIMENSION} Pixel groß sein.`));
          } else resolve(value);
        };
        image.src = value;
      };
      reader.readAsDataURL(file);
    });

    const uploadIcon = async (item, field, file) => {
      if (!file || destroyed || sourceError || !contains(item)) return;
      const ticket = ++item.uploadVersion[field];
      const currentGeneration = generation;
      const isCurrent = () => !destroyed && generation === currentGeneration
        && contains(item) && item.uploadVersion[field] === ticket;
      item.uploadErrors[field] = '';
      item.uploading[field] = true;
      refreshIconControl(item, field);
      refreshValidation();
      try {
        if ((file.type && file.type !== 'image/png') || !file.size || file.size > icons.MAX_PNG_BYTES) {
          throw new Error('Bitte eine PNG-Datei bis 64 KiB auswählen.');
        }
        const value = await readPng(file);
        if (!isCurrent()) return;
        updateIcon(item, field, value);
        announce('PNG-Icon übernommen.');
      } catch (error) {
        if (!isCurrent()) return;
        item.uploading[field] = false;
        item.uploadErrors[field] = error.message || 'Das PNG-Icon konnte nicht übernommen werden.';
        refreshIconControl(item, field);
        refreshValidation();
      }
    };

    const refreshParents = (entries) => {
      const groups = entries.filter(({ item }) => isGroup(item));
      for (const { item, parent } of entries) {
        const select = item.row?.parent;
        if (!select) continue;
        const options = [element('option', '', 'Hauptebene')];
        options[0].value = '';
        for (const candidate of groups) {
          if (!canPlace(item, candidate.item)) continue;
          const option = element('option', '', pathName([...candidate.ancestors, candidate.item]));
          option.value = String(candidate.item.key);
          options.push(option);
        }
        select.replaceChildren(...options);
        select.value = parent ? String(parent.key) : '';
      }
    };

    const refreshValidation = () => {
      const entries = walk();
      const links = entries.filter(({ item }) => !isGroup(item));
      const groups = entries.filter(({ item }) => isGroup(item));
      sourceMessage.textContent = sourceError;
      sourceMessage.hidden = !sourceError;
      count.textContent = sourceError ? `Maximal ${maxItems} Ziele / ${maxGroups} Gruppen`
        : `${links.length} / ${maxItems} Ziele · ${groups.length} / ${maxGroups} Gruppen`;
      add.disabled = Boolean(sourceError) || links.length >= maxItems || entries.length >= maxNodes;
      addGroup.disabled = Boolean(sourceError) || groups.length >= maxGroups || entries.length >= maxNodes;
      empty.hidden = Boolean(sourceError) || items.length !== 0;
      if (sourceError) return;

      const context = getContext();
      let modelError = null;
      try { model.validateItems(items.map(profileItem), context); }
      catch (error) { modelError = error; }
      const groupIds = new Map();
      for (const { item } of groups) groupIds.set(item.id, (groupIds.get(item.id) || 0) + 1);
      refreshParents(entries);
      entries.forEach(({ item, index, path, ancestors }) => {
        const row = item.row;
        if (!row) return;
        let labelError = '';
        let urlError = '';
        let groupError = '';
        const label = item.label.trim();
        if (!label) labelError = 'Eine Beschriftung fehlt.';
        else if (new TextEncoder().encode(label).length > 80) labelError = 'Die Beschriftung ist zu lang. Bitte einen kürzeren Menünamen verwenden.';
        if (isGroup(item)) {
          if (typeof item.id !== 'string' || item.id !== item.id.trim() || !/^[a-z][a-z0-9_-]{0,39}$/.test(item.id)) {
            groupError = 'Die Gruppenkennung ist ungültig. Bitte die id im erweiterten JSON-Feld korrigieren.';
          } else if (groupIds.get(item.id) > 1) {
            groupError = 'Die Gruppenkennung wird mehrfach verwendet. Bitte jede id im erweiterten JSON-Feld eindeutig vergeben.';
          }
          if (typeof item.collapsed !== 'boolean') groupError += ' „Beim Start eingeklappt“ bitte neu auswählen.';
        } else {
          try { model.resolveTarget(item.url, context); }
          catch (error) { urlError = error.message || 'Ein gültiges, vertrauenswürdiges Ziel fehlt.'; }
        }
        const iconErrors = {};
        for (const field of iconFields) {
          try { if (item[field] !== undefined) icons.validate(item[field]); }
          catch (error) { iconErrors[field] = error.message || 'Bitte ein gültiges Icon auswählen.'; }
        }
        const errorPath = modelError?.itemPath || (modelError?.itemIndex !== undefined ? [modelError.itemIndex] : []);
        const ruleError = modelError && errorPath.join('.') === path.join('.')
          && !labelError && !urlError && !groupError && !Object.keys(iconErrors).length
          ? modelError.message || 'Diesen Eintrag bitte prüfen.' : '';
        const message = [labelError, urlError, groupError, ...iconFields.map((field) => iconErrors[field] || item.uploadErrors[field]), ruleError].filter(Boolean).join(' ');
        row.error.textContent = message;
        row.error.hidden = !message;
        row.node.classList.toggle('has-error', Boolean(message));
        row.label.setAttribute('aria-invalid', labelError ? 'true' : 'false');
        row.url?.setAttribute('aria-invalid', urlError || ruleError ? 'true' : 'false');
        row.parent.setAttribute('aria-invalid', groupError ? 'true' : 'false');
        row.trail.textContent = pathName(ancestors);
        const name = itemName(item, index);
        row.parent.setAttribute('aria-label', `Gruppe für ${name}`);
        for (const field of iconFields) {
          const control = row.icons[field];
          const title = field === 'icon' ? 'Normales' : 'Aktives';
          control.select.setAttribute('aria-invalid', iconErrors[field] ? 'true' : 'false');
          control.select.setAttribute('aria-label', `${title} Icon für ${name}`);
          control.upload.setAttribute('aria-label', `${title} PNG-Icon für ${name} auswählen`);
          control.reset.setAttribute('aria-label', `${title} Icon für ${name} zurücksetzen`);
        }
        row.up.setAttribute('aria-label', `${name} nach oben verschieben`);
        row.down.setAttribute('aria-label', `${name} nach unten verschieben`);
        row.remove.setAttribute('aria-label', isGroup(item) ? `${name} auflösen und Einträge behalten` : `${name} entfernen`);
        row.handle.setAttribute('aria-label', `${name} ziehen; alternativ Pfeiltasten verwenden`);
        if (row.addChild) {
          row.addChild.disabled = add.disabled;
          row.addSubgroup.disabled = addGroup.disabled || ancestors.length + 1 >= maxDepth;
          row.addChild.setAttribute('aria-label', `Menüpunkt in ${name} hinzufügen`);
          row.addSubgroup.setAttribute('aria-label', `Untergruppe in ${name} hinzufügen`);
        }
      });
    };

    const serialize = () => {
      // Row events stay inside the editor. This single JSON input event feeds
      // the existing save tracking and preview without double-saving edits.
      textarea.value = JSON.stringify(items.map(profileItem), null, 2);
      currentSource = textarea.value;
      serializing = true;
      try { textarea.dispatchEvent(new Event('input', { bubbles: true })); }
      finally { serializing = false; }
      refreshValidation();
    };

    const focusItem = (key, action = 'label') => {
      const row = find(key)?.item.row;
      if (!row) {
        add.focus();
        return;
      }
      const target = row[action];
      (target && !target.disabled ? target : row.label).focus();
    };

    const clearDrag = () => {
      list.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((node) => {
        node.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
      });
      dragKey = null;
    };

    const move = (key, offset, action) => {
      const entry = find(key);
      if (!entry) return;
      const { index, siblings } = entry;
      const destination = index + offset;
      if (destination < 0 || destination >= siblings.length || sourceError) return;
      const [item] = siblings.splice(index, 1);
      siblings.splice(destination, 0, item);
      render();
      serialize();
      focusItem(key, action);
      announce(`${itemName(item, destination)} steht jetzt an Position ${destination + 1}.`);
    };

    const remove = (key) => {
      const entry = find(key);
      if (!entry || sourceError) return;
      const { index, siblings, item: removed } = entry;
      siblings.splice(index, 1, ...(isGroup(removed) ? removed.children : []));
      const next = siblings[Math.min(index, siblings.length - 1)];
      render();
      serialize();
      if (next) focusItem(next.key);
      else add.focus();
      announce(isGroup(removed) ? `${itemName(removed, index)} aufgelöst. Die Einträge bleiben erhalten.` : `${itemName(removed, index)} entfernt.`);
    };

    const changeParent = (key, parentKey) => {
      const entry = find(key);
      const parent = parentKey ? find(Number(parentKey))?.item : null;
      if (!entry || sourceError || (parentKey && !parent) || entry.parent === parent || !canPlace(entry.item, parent)) return;
      entry.siblings.splice(entry.index, 1);
      (parent ? parent.children : items).push(entry.item);
      render();
      serialize();
      focusItem(key, 'parent');
      announce(`${itemName(entry.item)} befindet sich jetzt in ${parent ? itemName(parent) : 'der Hauptebene'}.`);
    };

    const addItem = (group = false, parent = null) => {
      const entries = walk();
      if (sourceError || entries.length >= maxNodes
        || entries.filter(({ item }) => isGroup(item) === group).length >= (group ? maxGroups : maxItems)) return;
      const item = newItem(group ? { type: 'group', id: nextGroupId(), label: 'Neue Gruppe', collapsed: false, children: [] } : {});
      if (!canPlace(item, parent)) return;
      (parent ? parent.children : items).push(item);
      render();
      serialize();
      focusItem(item.key);
      if (group) item.row.label.select();
      announce(`${group ? 'Neue Gruppe' : 'Neuer Menüpunkt'} hinzugefügt.`);
    };

    const makeRow = ({ item, index, depth, siblings, ancestors, path }, linkIndex) => {
      const node = element('div', 'qb-nav-editor__row');
      node.setAttribute('role', 'listitem');
      node.dataset.navigationKey = String(item.key);
      node.dataset.navigationType = item.kind;
      node.dataset.navigationDepth = String(depth);
      node.style.setProperty('--qb-nav-depth', String(depth));
      node.classList.toggle('is-group', isGroup(item));
      if (isGroup(item)) node.dataset.navigationGroupId = item.id || '';
      const rowHeader = element('div', 'qb-nav-editor__row-header');
      const position = element('div', 'qb-nav-editor__position');
      position.append(element('span', 'qb-nav-editor__number', path.map((part) => part + 1).join('.')));
      position.append(element('span', `qb-nav-editor__badge${!isGroup(item) && linkIndex < maxTabs ? ' is-tab' : ''}`, isGroup(item) ? 'Gruppe' : linkIndex < maxTabs ? `Tab-Platz ${linkIndex + 1}` : 'Sidebar-Ziel'));
      const handle = button('qb-nav-editor__handle', '⠿', `Menüpunkt ${index + 1} ziehen`);
      handle.draggable = true;
      handle.title = 'Ziehen oder mit Pfeil hoch / runter verschieben';
      handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
      rowHeader.append(position, handle);
      const trail = element('p', 'qb-nav-editor__trail', pathName(ancestors));

      const fields = element('div', 'qb-nav-editor__fields');
      const labelWrapper = element('label', 'qb-nav-editor__field');
      labelWrapper.append(element('span', 'field-label', 'Beschriftung'));
      const label = element('input', 'field');
      label.type = 'text';
      label.value = item.label;
      label.maxLength = 80;
      label.placeholder = isGroup(item) ? 'Zum Beispiel Service' : 'Zum Beispiel News';
      label.dataset.navigationField = 'label';
      labelWrapper.append(label);
      const urlWrapper = element('label', 'qb-nav-editor__field');
      urlWrapper.append(element('span', 'field-label', 'Ziel / URL'));
      const url = element('input', 'field mono');
      url.type = 'text';
      url.inputMode = 'url';
      url.value = item.url;
      url.maxLength = 2048;
      url.placeholder = '/news';
      url.spellcheck = false;
      url.setAttribute('autocapitalize', 'none');
      url.dataset.navigationField = 'url';
      urlWrapper.append(url);
      const parentWrapper = element('label', 'qb-nav-editor__field qb-nav-editor__parent');
      parentWrapper.append(element('span', 'field-label', 'In Gruppe'));
      const parent = element('select', 'field');
      parent.dataset.navigationField = 'parent';
      parentWrapper.append(parent);
      fields.append(labelWrapper);
      if (!isGroup(item)) fields.append(urlWrapper);
      fields.append(parentWrapper);
      let collapsed = null;
      if (isGroup(item)) {
        const collapseLabel = element('label', 'qb-nav-editor__collapsed');
        collapsed = element('input');
        collapsed.type = 'checkbox';
        collapsed.checked = item.collapsed === true;
        collapsed.dataset.navigationField = 'collapsed';
        collapseLabel.append(collapsed, element('span', '', 'Beim Start eingeklappt'));
        fields.append(collapseLabel);
      }

      const error = element('p', 'qb-nav-editor__row-error');
      error.id = `${root.id || 'navigation-editor'}-error-${item.key}`;
      error.hidden = true;
      label.setAttribute('aria-describedby', error.id);
      url.setAttribute('aria-describedby', error.id);
      parent.setAttribute('aria-describedby', error.id);

      const actions = element('div', 'qb-nav-editor__actions');
      const up = button('btn compact qb-nav-editor__action', '↑');
      const down = button('btn compact qb-nav-editor__action', '↓');
      const removeButton = button('btn compact qb-nav-editor__remove', isGroup(item) ? 'Gruppe auflösen' : 'Entfernen');
      up.disabled = index === 0;
      down.disabled = index === siblings.length - 1;
      actions.append(up, down, removeButton);
      const iconGroup = element('fieldset', 'qb-nav-editor__icons');
      iconGroup.append(element('legend', 'field-label', 'Icons'));
      const iconControls = {};
      for (const field of iconFields) {
        const wrapper = element('div', 'qb-nav-editor__icon-field');
        const selectorLabel = element('label', 'qb-nav-editor__icon-label');
        selectorLabel.append(element('span', 'field-label', field === 'icon' ? 'Normal' : 'Aktiv'));
        const choice = element('span', 'qb-nav-editor__icon-choice');
        const preview = element('span', 'qb-nav-editor__icon-preview');
        preview.setAttribute('aria-hidden', 'true');
        const select = element('select', 'field');
        select.dataset.navigationField = field;
        select.setAttribute('aria-describedby', error.id);
        const none = element('option', '', field === 'icon' ? 'Kein Icon' : 'Wie normal');
        none.value = '';
        select.append(none);
        for (const icon of icons.CATALOG) {
          const option = element('option', '', icon.label);
          option.value = icon.id;
          select.append(option);
        }
        choice.append(preview, select);
        selectorLabel.append(choice);
        const upload = button('btn compact qb-nav-editor__icon-upload', 'PNG auswählen');
        const reset = button('btn compact qb-nav-editor__icon-reset', 'Zurücksetzen');
        const file = element('input');
        file.type = 'file';
        file.accept = 'image/png';
        file.hidden = true;
        file.dataset.navigationUpload = field;
        const iconActions = element('div', 'qb-nav-editor__icon-actions');
        iconActions.append(upload, reset, file);
        const status = element('p', 'qb-nav-editor__icon-status');
        status.setAttribute('aria-live', 'polite');
        wrapper.append(selectorLabel, iconActions, status);
        iconGroup.append(wrapper);
        iconControls[field] = { select, preview, upload, reset, file, status };
        select.addEventListener('input', (event) => event.stopPropagation());
        select.addEventListener('change', (event) => {
          event.stopPropagation();
          if (!select.value.startsWith('__')) updateIcon(item, field, select.value);
        });
        upload.addEventListener('click', () => file.click());
        reset.addEventListener('click', () => updateIcon(item, field, ''));
        file.addEventListener('input', (event) => event.stopPropagation());
        file.addEventListener('change', (event) => {
          event.stopPropagation();
          const selected = file.files?.[0];
          file.value = '';
          uploadIcon(item, field, selected);
        });
      }
      const iconHelp = element('p', 'qb-nav-editor__help qb-nav-editor__icon-help', 'Eigene PNG-Icons: bis 64 KiB und 256 × 256 px. Ohne aktives Icon wird das normale übernommen.');
      iconGroup.append(iconHelp);
      let addChild = null;
      let addSubgroup = null;
      const childActions = element('div', 'qb-nav-editor__child-actions');
      if (isGroup(item)) {
        addChild = button('btn compact', '+ Menüpunkt');
        addSubgroup = button('btn compact', '+ Untergruppe');
        childActions.append(addChild, addSubgroup);
        addChild.addEventListener('click', () => addItem(false, item));
        addSubgroup.addEventListener('click', () => addItem(true, item));
      }
      node.append(rowHeader, trail, fields, iconGroup);
      if (isGroup(item)) node.append(childActions);
      node.append(error, actions);
      item.row = { node, label, url: isGroup(item) ? null : url, parent, collapsed, trail, error, up, down, remove: removeButton, handle, icons: iconControls, addChild, addSubgroup };
      for (const field of iconFields) refreshIconControl(item, field);

      (isGroup(item) ? [label] : [label, url]).forEach((input) => {
        input.addEventListener('input', (event) => {
          event.stopPropagation();
          item[input.dataset.navigationField] = input.value;
          serialize();
        });
        input.addEventListener('change', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => {
          // Pressing Return on a phone's keyboard must not submit the app form.
          if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
        });
      });
      parent.addEventListener('input', (event) => event.stopPropagation());
      parent.addEventListener('change', (event) => {
        event.stopPropagation();
        changeParent(item.key, parent.value);
      });
      if (collapsed) {
        collapsed.addEventListener('input', (event) => event.stopPropagation());
        collapsed.addEventListener('change', (event) => {
          event.stopPropagation();
          item.collapsed = collapsed.checked;
          serialize();
        });
      }
      up.addEventListener('click', () => move(item.key, -1, 'up'));
      down.addEventListener('click', () => move(item.key, 1, 'down'));
      removeButton.addEventListener('click', () => remove(item.key));
      handle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        move(item.key, event.key === 'ArrowUp' ? -1 : 1, 'handle');
      });
      handle.addEventListener('dragstart', (event) => {
        dragKey = item.key;
        node.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(item.key));
        }
      });
      handle.addEventListener('dragend', clearDrag);
      node.addEventListener('dragover', (event) => {
        if (dragKey === null || dragKey === item.key) return;
        const moving = find(dragKey);
        const target = find(item.key);
        if (!moving || !target || !canPlace(moving.item, target.parent)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const after = event.clientY > node.getBoundingClientRect().top + node.offsetHeight / 2;
        list.querySelectorAll('.is-drop-before, .is-drop-after').forEach((row) => row.classList.remove('is-drop-before', 'is-drop-after'));
        node.classList.add(after ? 'is-drop-after' : 'is-drop-before');
      });
      node.addEventListener('dragleave', (event) => {
        if (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget)) {
          node.classList.remove('is-drop-before', 'is-drop-after');
        }
      });
      node.addEventListener('drop', (event) => {
        if (dragKey === null || dragKey === item.key) return;
        event.preventDefault();
        const after = event.clientY > node.getBoundingClientRect().top + node.offsetHeight / 2;
        const movedKey = dragKey;
        const moving = find(movedKey);
        const target = find(item.key);
        if (!moving || !target || !canPlace(moving.item, target.parent)) { clearDrag(); return; }
        moving.siblings.splice(moving.index, 1);
        const destination = target.siblings.indexOf(item) + (after ? 1 : 0);
        target.siblings.splice(destination, 0, moving.item);
        clearDrag();
        render();
        serialize();
        focusItem(movedKey, 'handle');
        announce(`${itemName(moving.item, destination)} steht jetzt an Position ${destination + 1}.`);
      });
      return node;
    };

    const render = () => {
      let linkIndex = 0;
      list.replaceChildren(...(sourceError ? [] : walk().map((entry) => makeRow(entry, isGroup(entry.item) ? -1 : linkIndex++))));
      refreshValidation();
    };

    const load = () => {
      generation += 1;
      clearDrag();
      currentSource = textarea.value;
      try {
        const parsed = JSON.parse(textarea.value.trim() || '[]');
        if (!Array.isArray(parsed)) throw new Error('Die Menüdefinition muss ein JSON-Array sein.');
        let total = 0;
        let links = 0;
        let groups = 0;
        const inspect = (nodes, depth = 0) => {
          if (nodes.length > maxNodes) throw new Error(`Die Menüliste ist zu lang. Bitte im JSON-Feld auf ${maxItems} Ziele und ${maxGroups} Gruppen kürzen.`);
          for (const item of nodes) {
            total += 1;
            if (total > maxNodes) throw new Error(`Maximal ${maxNodes} Ziele und Gruppen zusammen sind möglich.`);
            if (!item || Array.isArray(item) || typeof item !== 'object'
              || (item.label !== undefined && typeof item.label !== 'string')
              || (item.url !== undefined && typeof item.url !== 'string')) {
              throw new Error('Jeder Eintrag benötigt eine Beschriftung als Text; Ziele benötigen eine URL. Bitte die JSON-Struktur prüfen.');
            }
            if (item.type === 'group') {
              groups += 1;
              if (groups > maxGroups || depth >= maxDepth) throw new Error(`Maximal ${maxGroups} Gruppen in ${maxDepth} Gruppenebenen sind möglich. Bitte die JSON-Struktur kürzen.`);
              if ('url' in item || !Array.isArray(item.children)) throw new Error('Gruppen benötigen eine children-Liste und dürfen keine URL enthalten. Bitte das JSON korrigieren.');
              inspect(item.children, depth + 1);
            } else {
              links += 1;
              if (links > maxItems) throw new Error(`Maximal ${maxItems} Ziele sind möglich, einschließlich der Ziele in Gruppen.`);
              if ((item.type !== undefined && item.type !== 'link') || ['children', 'id', 'collapsed'].some((field) => field in item)) {
                throw new Error('Menüziele dürfen keine Gruppeneigenschaften enthalten. Bitte den Typ im JSON prüfen.');
              }
            }
          }
        };
        inspect(parsed);
        items = parsed.map(newItem);
        sourceError = '';
      } catch (error) {
        items = [];
        sourceError = error instanceof SyntaxError
          ? 'Die JSON-Eingabe ist noch unvollständig oder ungültig. Sie bleibt erhalten. Bitte im erweiterten JSON-Feld korrigieren.'
          : error.message;
      }
      render();
    };

    // Blurring the JSON field fires change after its input was already handled.
    // Rehydrating the same draft here would invalidate a pending upload and can
    // replace the very row button that is receiving that focus-changing click.
    const onJsonInput = () => { if (!serializing && textarea.value !== currentSource) load(); };
    textarea.addEventListener('input', onJsonInput);
    textarea.addEventListener('change', onJsonInput);
    add.addEventListener('click', () => addItem());
    addGroup.addEventListener('click', () => addItem(true));

    load();
    return {
      load,
      refreshValidation,
      destroy() {
        destroyed = true;
        generation += 1;
        items = [];
        textarea.removeEventListener('input', onJsonInput);
        textarea.removeEventListener('change', onJsonInput);
        window.clearTimeout(announceTimer);
        root.replaceChildren();
      },
    };
  };

  window.QuantumNavigationEditor = { create };
})();
