(() => {
  'use strict';

  const create = ({ root, textarea, getContext = () => ({}) }) => {
    if (!root || !textarea) throw new Error('Navigation editor requires a root and JSON field.');

    const model = window.QuantumNavigationModel;
    if (!model) throw new Error('Navigation model must load before the editor.');
    const maxItems = model.MAX_ITEMS || 12;
    const maxTabs = model.MAX_TABS || 5;
    let items = [];
    let nextKey = 0;
    let sourceError = '';
    let serializing = false;
    let dragKey = null;
    let announceTimer = null;

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
    header.append(heading, add);

    const help = element('p', 'qb-nav-editor__help', 'Beschriftung und Ziel bearbeiten. Mit den Pfeilen sortieren oder am Griff ziehen.');
    const sourceMessage = element('p', 'qb-nav-editor__error');
    sourceMessage.setAttribute('role', 'status');
    sourceMessage.hidden = true;
    const list = element('div', 'qb-nav-editor__list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Geordnete Navigationsziele');
    const empty = element('p', 'qb-nav-editor__empty', 'Keine eigenen Menüpunkte. Aktivierte Sidebar und Bottom Tabs zeigen dann automatisch Home.');
    const footer = element('p', 'qb-nav-editor__help', `Sidebar: bis zu ${maxItems} Ziele. Bottom Tabs: die ersten ${maxTabs} Einträge in dieser Reihenfolge.`);
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

    const itemName = (item, index) => item.label.trim() || `Menüpunkt ${index + 1}`;

    const refreshValidation = () => {
      sourceMessage.textContent = sourceError;
      sourceMessage.hidden = !sourceError;
      count.textContent = sourceError ? `Maximal ${maxItems}` : `${items.length} / ${maxItems}`;
      add.disabled = Boolean(sourceError) || items.length >= maxItems;
      empty.hidden = Boolean(sourceError) || items.length !== 0;
      if (sourceError) return;

      const context = getContext();
      items.forEach((item, index) => {
        const row = item.row;
        if (!row) return;
        let labelError = '';
        let urlError = '';
        const label = item.label.trim();
        if (!label) labelError = 'Eine Beschriftung fehlt.';
        else if (new TextEncoder().encode(label).length > 80) labelError = 'Die Beschriftung ist zu lang. Bitte einen kürzeren Menünamen verwenden.';

        try {
          model.resolveTarget(item.url, context);
        } catch (error) {
          urlError = error.message || 'Ein gültiges, vertrauenswürdiges Ziel fehlt.';
        }

        // The shared validator is also authoritative for future profile rules.
        let ruleError = '';
        if (!labelError && !urlError) {
          try { model.validateItems([{ label: item.label, url: item.url }], context); }
          catch (error) { ruleError = error.message || 'Diesen Menüpunkt bitte prüfen.'; }
        }

        const message = [labelError, urlError, ruleError].filter(Boolean).join(' ');
        row.error.textContent = message;
        row.error.hidden = !message;
        row.node.classList.toggle('has-error', Boolean(message));
        row.label.setAttribute('aria-invalid', labelError ? 'true' : 'false');
        row.url.setAttribute('aria-invalid', urlError || ruleError ? 'true' : 'false');
        const name = itemName(item, index);
        row.up.setAttribute('aria-label', `${name} nach oben verschieben`);
        row.down.setAttribute('aria-label', `${name} nach unten verschieben`);
        row.remove.setAttribute('aria-label', `${name} entfernen`);
        row.handle.setAttribute('aria-label', `${name} ziehen; alternativ Pfeiltasten verwenden`);
      });
    };

    const serialize = () => {
      // Row events stay inside the editor. This single JSON input event feeds
      // the existing save tracking and preview without double-saving edits.
      textarea.value = JSON.stringify(items.map((item) => ({ ...item.original, label: item.label, url: item.url })), null, 2);
      serializing = true;
      try { textarea.dispatchEvent(new Event('input', { bubbles: true })); }
      finally { serializing = false; }
      refreshValidation();
    };

    const focusItem = (key, action = 'label') => {
      const row = items.find((item) => item.key === key)?.row;
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
      const index = items.findIndex((item) => item.key === key);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= items.length || sourceError) return;
      const [item] = items.splice(index, 1);
      items.splice(destination, 0, item);
      render();
      serialize();
      focusItem(key, action);
      announce(`${itemName(item, destination)} steht jetzt an Position ${destination + 1}.`);
    };

    const remove = (key) => {
      const index = items.findIndex((item) => item.key === key);
      if (index < 0 || sourceError) return;
      const [removed] = items.splice(index, 1);
      const next = items[Math.min(index, items.length - 1)];
      render();
      serialize();
      if (next) focusItem(next.key);
      else add.focus();
      announce(`${itemName(removed, index)} entfernt.`);
    };

    const makeRow = (item, index) => {
      const node = element('div', 'qb-nav-editor__row');
      node.setAttribute('role', 'listitem');
      node.dataset.navigationKey = String(item.key);
      const rowHeader = element('div', 'qb-nav-editor__row-header');
      const position = element('div', 'qb-nav-editor__position');
      position.append(element('span', 'qb-nav-editor__number', String(index + 1).padStart(2, '0')));
      position.append(element('span', `qb-nav-editor__badge${index < maxTabs ? ' is-tab' : ''}`, index < maxTabs ? `Tab ${index + 1} + Sidebar` : 'Sidebar'));
      const handle = button('qb-nav-editor__handle', '⠿', `Menüpunkt ${index + 1} ziehen`);
      handle.draggable = true;
      handle.title = 'Ziehen oder mit Pfeil hoch / runter verschieben';
      handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
      rowHeader.append(position, handle);

      const fields = element('div', 'qb-nav-editor__fields');
      const labelWrapper = element('label', 'qb-nav-editor__field');
      labelWrapper.append(element('span', 'field-label', 'Beschriftung'));
      const label = element('input', 'field');
      label.type = 'text';
      label.value = item.label;
      label.maxLength = 80;
      label.placeholder = 'Zum Beispiel News';
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
      fields.append(labelWrapper, urlWrapper);

      const error = element('p', 'qb-nav-editor__row-error');
      error.id = `${root.id || 'navigation-editor'}-error-${item.key}`;
      error.hidden = true;
      label.setAttribute('aria-describedby', error.id);
      url.setAttribute('aria-describedby', error.id);

      const actions = element('div', 'qb-nav-editor__actions');
      const up = button('btn compact qb-nav-editor__action', '↑');
      const down = button('btn compact qb-nav-editor__action', '↓');
      const removeButton = button('btn compact qb-nav-editor__remove', 'Entfernen');
      up.disabled = index === 0;
      down.disabled = index === items.length - 1;
      actions.append(up, down, removeButton);
      node.append(rowHeader, fields, error, actions);
      item.row = { node, label, url, error, up, down, remove: removeButton, handle };

      [label, url].forEach((input) => {
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
        const moving = items.find((candidate) => candidate.key === movedKey);
        if (!moving) { clearDrag(); return; }
        const remaining = items.filter((candidate) => candidate.key !== movedKey);
        const destination = remaining.findIndex((candidate) => candidate.key === item.key) + (after ? 1 : 0);
        remaining.splice(destination, 0, moving);
        items = remaining;
        clearDrag();
        render();
        serialize();
        focusItem(movedKey, 'handle');
        announce(`${itemName(moving, destination)} steht jetzt an Position ${destination + 1}.`);
      });
      return node;
    };

    const render = () => {
      list.replaceChildren(...(sourceError ? [] : items.map(makeRow)));
      refreshValidation();
    };

    const load = () => {
      clearDrag();
      try {
        const parsed = JSON.parse(textarea.value.trim() || '[]');
        if (!Array.isArray(parsed)) throw new Error('Die Menüdefinition muss ein JSON-Array sein.');
        if (parsed.length > maxItems) throw new Error(`Die Menüdefinition enthält mehr als ${maxItems} Einträge. Bitte zuerst im JSON-Feld kürzen.`);
        if (parsed.some((item) => !item || Array.isArray(item) || typeof item !== 'object'
          || (item.label !== undefined && typeof item.label !== 'string')
          || (item.url !== undefined && typeof item.url !== 'string'))) {
          throw new Error('Jeder Menüpunkt benötigt eine Beschriftung und eine URL als Text. Bitte die JSON-Struktur prüfen.');
        }
        items = parsed.map((item) => ({ key: ++nextKey, original: item, label: item.label || '', url: item.url || '' }));
        sourceError = '';
      } catch (error) {
        items = [];
        sourceError = error instanceof SyntaxError
          ? 'Die JSON-Eingabe ist noch unvollständig oder ungültig. Sie bleibt erhalten. Bitte im erweiterten JSON-Feld korrigieren.'
          : error.message;
      }
      render();
    };

    const onJsonInput = () => { if (!serializing) load(); };
    textarea.addEventListener('input', onJsonInput);
    textarea.addEventListener('change', onJsonInput);
    add.addEventListener('click', () => {
      if (sourceError || items.length >= maxItems) return;
      const item = { key: ++nextKey, original: {}, label: '', url: '' };
      items.push(item);
      render();
      serialize();
      focusItem(item.key);
      announce(`Neuer Menüpunkt an Position ${items.length}.`);
    });

    load();
    return {
      load,
      refreshValidation,
      destroy() {
        textarea.removeEventListener('input', onJsonInput);
        textarea.removeEventListener('change', onJsonInput);
        window.clearTimeout(announceTimer);
        root.replaceChildren();
      },
    };
  };

  window.QuantumNavigationEditor = { create };
})();
