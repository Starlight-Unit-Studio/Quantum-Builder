(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const storage = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, String(value)); } catch {}
    },
  };

  const state = {
    zoom: Math.max(0, Math.min(100, Number(storage.get('qb.sim.zoom', 100)) || 0)),
    muted: storage.get('qb.sim.muted', '1') !== '0',
    device: storage.get('qb.sim.device', 'phone') === 'tablet' ? 'tablet' : 'phone',
    landscape: storage.get('qb.sim.landscape', '0') === '1',
    profile: null,
    history: [],
    historyIndex: -1,
    currentUrl: '',
    drawerOpen: false,
    validationError: '',
    effectiveNavigation: {},
  };

  const frame = () => $('simulatorFrame');
  const device = () => $('simulatorDevice');
  const stage = () => $('simulatorStage');
  let surfaces = null;
  let drawerTrigger = null;
  const menuBindings = new WeakMap();
  let groupStates = new Map();
  const menuGroupStates = new Map();
  let activeSidebarMenu = null;
  let groupBindings = new Map();
  let groupRoute = null;

  const create = (tag, className, text = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  const actionButton = (label, symbol, action, className = 'sim-native-action') => {
    const button = create('button', className, symbol);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('click', action);
    return button;
  };

  const setStatus = (message = '') => {
    if (!surfaces) return;
    surfaces.status.textContent = message;
    surfaces.status.hidden = !message;
  };

  const closeDrawer = (restoreFocus = false) => {
    state.drawerOpen = false;
    if (!surfaces) return;
    surfaces.overlay.hidden = true;
    surfaces.menu.setAttribute('aria-expanded', 'false');
    surfaces.launcher.setAttribute('aria-expanded', 'false');
    for (const node of [frame(), surfaces.top, surfaces.launcher, surfaces.tabs, surfaces.toolbar]) {
      node?.removeAttribute('inert');
    }
    if (restoreFocus && drawerTrigger?.isConnected && drawerTrigger.getClientRects().length) {
      drawerTrigger.focus({ preventScroll: true });
    }
    drawerTrigger = null;
  };

  const openDrawer = (event) => {
    if (!surfaces || !state.effectiveNavigation.sidebar) return;
    drawerTrigger = event?.currentTarget || surfaces.menu;
    state.drawerOpen = true;
    surfaces.overlay.hidden = false;
    surfaces.menu.setAttribute('aria-expanded', 'true');
    surfaces.launcher.setAttribute('aria-expanded', 'true');
    for (const node of [frame(), surfaces.top, surfaces.launcher, surfaces.tabs, surfaces.toolbar]) {
      node?.setAttribute('inert', '');
    }
    surfaces.close.focus({ preventScroll: true });
  };

  const resolveTarget = (target) => {
    const profile = state.profile;
    const model = window.QuantumNavigationModel;
    if (!profile || !model) throw new Error('Kein gültiges App-Profil für die Vorschau.');
    return model.resolveTarget(target, {
      startUrl: profile.startUrl,
      trustedDomain: profile.trustedDomain,
    });
  };

  const sameLocation = (left, right) => left.split('#', 1)[0] === right.split('#', 1)[0];

  const syncGroupVisibility = () => {
    for (const [id, binding] of groupBindings) {
      const expanded = groupStates.get(id)?.expanded !== false;
      binding.button.setAttribute('aria-expanded', String(expanded));
      binding.content.hidden = !expanded;
      binding.chevron.textContent = expanded ? '▾' : '▸';
    }
  };

  const clearGroups = () => {
    menuGroupStates.clear();
    groupStates = new Map();
    groupBindings.clear();
    activeSidebarMenu = null;
    groupRoute = null;
  };

  const prepareMenuGroups = (navigation, selectedMenu) => {
    const model = window.QuantumNavigationModel;
    const menus = navigation.resolvedMenus || new Map();
    const routeChanged = groupRoute !== state.currentUrl;
    for (const id of menuGroupStates.keys()) if (!menus.has(id)) menuGroupStates.delete(id);
    for (const [menuId, tree] of menus) {
      let record = menuGroupStates.get(menuId);
      if (!record) {
        record = { states: new Map(), targets: new Map() };
        menuGroupStates.set(menuId, record);
      }
      const ids = new Set();
      for (const { item } of model.walkItems(tree)) {
        if (!model.isGroup(item)) continue;
        ids.add(item.id);
        const targets = model.flattenItems(item.children).map((link) => link.resolvedUrl);
        const wasActive = record.targets.get(item.id)?.some((url) => sameLocation(url, state.currentUrl));
        const isActive = targets.some((url) => sameLocation(url, state.currentUrl));
        let previous = record.states.get(item.id);
        const reset = !previous || previous.configuredCollapsed !== item.collapsed;
        if (reset) {
          previous = { expanded: !item.collapsed, configuredCollapsed: item.collapsed };
          record.states.set(item.id, previous);
        }
        if (isActive && (reset || routeChanged || !wasActive)) previous.expanded = true;
        record.targets.set(item.id, targets);
      }
      for (const id of record.states.keys()) if (!ids.has(id)) {
        record.states.delete(id);
        record.targets.delete(id);
      }
    }
    if (activeSidebarMenu !== selectedMenu) {
      closeDrawer(true);
      surfaces.items.replaceChildren();
      groupBindings.clear();
      activeSidebarMenu = selectedMenu;
    }
    groupStates = menuGroupStates.get(selectedMenu)?.states || new Map();
    groupRoute = state.currentUrl;
  };

  const updateHistoryState = () => {
    if (!surfaces) return;
    surfaces.back.disabled = state.historyIndex <= 0;
    surfaces.forward.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
    const ready = Boolean(state.currentUrl);
    surfaces.home.disabled = !ready;
    surfaces.contextHome.disabled = !ready;
    surfaces.reload.disabled = !ready;
    syncGroupVisibility();
    const buttons = [...surfaces.tabs.children, ...surfaces.items.querySelectorAll('.sim-native-item')];
    for (const button of buttons) {
      const binding = menuBindings.get(button);
      if (!binding) continue;
      const active = ready && (binding.group
        ? binding.targets.some((url) => sameLocation(url, state.currentUrl))
        : sameLocation(button.dataset.target || '', state.currentUrl));
      button.classList.toggle('is-selected', active);
      if (active && !binding.group) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      const icon = active ? binding.item.active_icon || binding.item.icon || '' : binding.item.icon || '';
      if (binding.iconValue !== icon) {
        const image = window.QuantumNavigationIcons.createElement(icon, { className: 'sim-native-icon-image' });
        binding.slot.replaceChildren(...(image ? [image] : []));
        binding.iconValue = icon;
      }
    }
  };

  const loadFrame = (url) => {
    const targetFrame = frame();
    if (!targetFrame) return;
    targetFrame.dataset.url = state.profile?.startUrl || '';
    targetFrame.dataset.previewUrl = url;
    targetFrame.src = url;
    $('simFallback')?.classList.add('is-hidden');
  };

  const navigate = (target, { historyIndex = null } = {}) => {
    try {
      const url = resolveTarget(target);
      if (historyIndex !== null) {
        state.historyIndex = historyIndex;
      } else if (url !== state.currentUrl) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(url);
        if (state.history.length > 100) state.history.shift();
        state.historyIndex = state.history.length - 1;
      }
      state.currentUrl = url;
      loadFrame(url);
      setStatus(state.validationError);
      renderNavigation();
      return true;
    } catch (error) {
      setStatus(error.message || 'Dieses Ziel ist für die App-Vorschau nicht freigegeben.');
      return false;
    }
  };

  const moveHistory = (direction) => {
    const next = state.historyIndex + direction;
    if (next < 0 || next >= state.history.length) return;
    navigate(state.history[next], { historyIndex: next });
  };

  const ensureSurfaces = () => {
    if (surfaces) return surfaces;
    const targetFrame = frame();
    if (!targetFrame || !device()) return null;

    const screen = create('div', 'sim-native-screen');
    targetFrame.before(screen);
    screen.append(targetFrame);
    const fallback = $('simFallback');
    if (fallback) screen.append(fallback);

    const top = create('nav', 'sim-native-top');
    top.setAttribute('aria-label', 'Obere Navigation der Vorschau');
    const menu = actionButton('Seitenmenü der Vorschau öffnen', '☰', openDrawer);
    const title = create('span', 'sim-native-title');
    const home = actionButton('Startseite der Vorschau', '⌂', () => goHome());
    top.append(menu, title, home);

    const launcher = actionButton('Seitenmenü der Vorschau öffnen', '☰', openDrawer, 'sim-native-action sim-native-launcher');
    const tabs = create('nav', 'sim-native-tabs');
    tabs.setAttribute('aria-label', 'Untere Tabs der Vorschau');

    const toolbar = create('nav', 'sim-native-toolbar');
    toolbar.setAttribute('aria-label', 'Navigationswerkzeuge der Vorschau');
    const back = actionButton('Vorheriges Vorschau-Ziel', '‹', () => moveHistory(-1));
    const contextHome = actionButton('Startseite der Vorschau', '⌂', () => goHome());
    const reload = actionButton('Aktuelles Vorschau-Ziel neu laden', '↻', () => reloadFrame());
    const forward = actionButton('Nächstes Vorschau-Ziel', '›', () => moveHistory(1));
    toolbar.append(back, contextHome, reload, forward);

    const overlay = create('div', 'sim-native-drawer-overlay');
    overlay.hidden = true;
    const backdrop = actionButton('Seitenmenü der Vorschau schließen', '', () => closeDrawer(true), 'sim-native-backdrop');
    backdrop.tabIndex = -1;
    const drawer = create('aside', 'sim-native-drawer');
    drawer.id = 'simNativeDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'false');
    drawer.setAttribute('aria-labelledby', 'simNativeDrawerTitle');
    const drawerHeader = create('div', 'sim-native-drawer-header');
    const drawerTitle = create('h4', 'sim-native-drawer-title');
    drawerTitle.id = 'simNativeDrawerTitle';
    const close = actionButton('Seitenmenü der Vorschau schließen', '×', () => closeDrawer(true));
    drawerHeader.append(drawerTitle, close);
    const items = create('nav', 'sim-native-drawer-items');
    items.setAttribute('aria-label', 'Seitenmenü der Vorschau');
    drawer.append(drawerHeader, items);
    overlay.append(backdrop, drawer);

    for (const trigger of [menu, launcher]) {
      trigger.setAttribute('aria-controls', drawer.id);
      trigger.setAttribute('aria-expanded', 'false');
    }
    screen.append(top, launcher, tabs, toolbar, overlay);

    const note = create('p', 'sim-navigation-note', 'Native Navigation wird angenähert dargestellt. Zurück/Vor erfasst die Vorschau-Menüs; Seitenwechsel innerhalb fremder Webseiten sind hier nicht auslesbar.');
    const status = create('p', 'sim-navigation-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    stage()?.after(note, status);

    surfaces = { screen, top, menu, title, home, launcher, tabs, toolbar, back, contextHome, reload, forward, overlay, drawer, drawerTitle, close, items, note, status };
    for (const surface of [top, launcher, tabs, toolbar]) surface.hidden = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.drawerOpen && screen.contains(document.activeElement)) {
        event.preventDefault();
        closeDrawer(true);
      }
    });
    return surfaces;
  };

  const syncMenu = (container, items, isSidebar) => {
    const hasIcons = items.some((item) => item.icon || item.active_icon);
    container.classList.toggle('has-icons', hasIcons);
    while (container.children.length > items.length) container.lastElementChild.remove();
    items.forEach((item, index) => {
      let button = container.children[index];
      if (!button) {
        button = create('button', isSidebar ? 'sim-native-item' : 'sim-native-tab');
        button.type = 'button';
        button.addEventListener('click', () => {
          if (isSidebar) closeDrawer(true);
          navigate(button.dataset.target);
        });
        const slot = create('span', 'sim-native-icon');
        slot.setAttribute('aria-hidden', 'true');
        const label = create('span', 'sim-native-menu-label');
        button.append(slot, label);
        menuBindings.set(button, { slot, label, item, iconValue: null });
        container.append(button);
      }
      const binding = menuBindings.get(button);
      binding.item = item;
      binding.label.textContent = item.label;
      binding.slot.hidden = !hasIcons;
      button.title = item.label;
      button.setAttribute('aria-label', item.label);
      button.dataset.target = item.resolvedUrl;
    });
  };

  const syncSidebar = (items) => {
    const model = window.QuantumNavigationModel;
    const entries = model.walkItems(items);
    const hasIcons = entries.some(({ item }) => item.icon || item.active_icon);
    const nextBindings = new Map();
    const currentIds = new Set();
    const sync = (container, children, depth = 0, parentPath = []) => {
      const existing = new Map(Array.from(container.children, (node) => [node.dataset.nodeKey, node]));
      children.forEach((item, index) => {
        const path = [...parentPath, index];
        const group = model.isGroup(item);
        const key = group ? 'group:' + item.id : 'link:' + path.join('.');
        let node = existing.get(key);
        existing.delete(key);
        if (!node) {
          node = group ? create('div', 'sim-native-group') : create('button', 'sim-native-item');
          const button = group ? create('button', 'sim-native-item sim-native-group-toggle') : node;
          button.type = 'button';
          const slot = create('span', 'sim-native-icon');
          slot.setAttribute('aria-hidden', 'true');
          const label = create('span', 'sim-native-menu-label');
          button.append(slot, label);
          const binding = { button, slot, label, item, group, iconValue: null, targets: [] };
          menuBindings.set(button, binding);
          if (group) {
            const chevron = create('span', 'sim-native-group-chevron');
            chevron.setAttribute('aria-hidden', 'true');
            const content = create('div', 'sim-native-group-children');
            content.id = 'simNativeGroup-' + item.id;
            content.setAttribute('role', 'group');
            button.setAttribute('aria-controls', content.id);
            button.dataset.groupId = item.id;
            button.append(chevron);
            node.append(button, content);
            Object.assign(binding, { content, chevron });
            button.addEventListener('click', () => {
              const state = groupStates.get(button.dataset.groupId);
              if (!state) return;
              state.expanded = !state.expanded;
              syncGroupVisibility();
            });
          } else {
            button.addEventListener('click', () => {
              closeDrawer(true);
              navigate(button.dataset.target);
            });
          }
          node.dataset.nodeKey = key;
        }
        if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
        const button = group ? node.firstElementChild : node;
        const binding = menuBindings.get(button);
        binding.item = item;
        binding.label.textContent = item.label;
        binding.slot.hidden = !hasIcons;
        button.style.paddingInlineStart = `${14 + depth * 12}px`;
        button.title = item.label;
        button.setAttribute('aria-label', item.label);
        if (group) {
          currentIds.add(item.id);
          const targets = model.flattenItems(item.children).map((link) => link.resolvedUrl);
          binding.targets = targets;
          binding.content.setAttribute('aria-label', item.label);
          nextBindings.set(item.id, binding);
          sync(binding.content, item.children, depth + 1, path);
        } else button.dataset.target = item.resolvedUrl;
      });
      for (const node of existing.values()) node.remove();
    };
    sync(surfaces.items, items);
    groupBindings = nextBindings;
    for (const id of groupStates.keys()) if (!currentIds.has(id)) groupStates.delete(id);
  };

  const renderNavigation = () => {
    const nodes = ensureSurfaces();
    if (!nodes) return;
    const profileNavigation = state.profile?.navigation || {};
    const nav = window.QuantumNavigationModel.selectNavigation(profileNavigation, state.currentUrl, {
      startUrl: state.profile?.startUrl, trustedDomain: state.profile?.trustedDomain,
    });
    state.effectiveNavigation = nav;
    prepareMenuGroups(profileNavigation, nav.sidebar_menu);
    const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    nodes.screen.style.setProperty('--sim-nav-background', color(nav.background, '#020611'));
    nodes.screen.style.setProperty('--sim-nav-foreground', color(nav.foreground, '#ffffff'));
    nodes.screen.style.setProperty('--sim-nav-accent', color(nav.accent, '#6fc7ff'));
    nodes.screen.style.setProperty('--sim-nav-top-height', nav.top_bar ? '52px' : '0px');
    nodes.screen.style.setProperty('--sim-nav-tabs-height', nav.bottom_tabs ? '58px' : '0px');
    nodes.screen.style.setProperty('--sim-nav-context-height', nav.contextual_toolbar ? '46px' : '0px');
    nodes.top.hidden = !nav.top_bar;
    nodes.menu.hidden = !nav.sidebar;
    nodes.launcher.hidden = !nav.sidebar || Boolean(nav.top_bar);
    nodes.tabs.hidden = !nav.bottom_tabs;
    nodes.toolbar.hidden = !nav.contextual_toolbar;
    const appTitle = String(nav.title || '').trim() || state.profile?.name || '';
    nodes.title.textContent = appTitle || 'Quantum App';
    nodes.title.title = nodes.title.textContent;
    nodes.drawerTitle.textContent = appTitle || 'Navigation';

    const fallback = state.currentUrl ? [{ label: 'Home', resolvedUrl: state.profile.startUrl }] : [];
    const tree = profileNavigation.resolvedMenus?.get(nav.sidebar_menu) || [];
    const tabTree = profileNavigation.resolvedMenus?.get(nav.bottom_tabs_menu) || [];
    const sidebarItems = window.QuantumNavigationModel.flattenItems(tree);
    const tabItems = window.QuantumNavigationModel.flattenItems(tabTree);
    syncSidebar(sidebarItems.length ? tree : [...tree, ...fallback]);
    syncMenu(nodes.tabs, (tabItems.length ? tabItems : fallback).slice(0, 5), false);
    nodes.items.dataset.menuId = nav.sidebar_menu;
    nodes.tabs.dataset.menuId = nav.bottom_tabs_menu;
    nodes.screen.dataset.matchedRule = String(nav.matchedRuleIndex);
    if (!nav.sidebar) closeDrawer();
    updateHistoryState();
  };

  const clearPreview = () => {
    state.history = [];
    state.historyIndex = -1;
    state.currentUrl = '';
    clearGroups();
    closeDrawer();
    const targetFrame = frame();
    if (targetFrame) {
      targetFrame.dataset.url = state.profile?.startUrl || '';
      delete targetFrame.dataset.previewUrl;
      targetFrame.src = 'about:blank';
    }
    $('simFallback')?.classList.remove('is-hidden');
    updateHistoryState();
  };

  const updateProfile = (input) => {
    ensureSurfaces();
    if (!input) {
      state.profile = null;
      state.validationError = '';
      clearPreview();
      renderNavigation();
      setStatus();
      return;
    }

    const previous = state.profile;
    const next = {
      id: String(input.id ?? ''),
      name: String(input.name ?? '').trim(),
      startUrl: String(input.startUrl ?? '').trim(),
      trustedDomain: String(input.trustedDomain ?? '').trim().toLowerCase(),
      navigation: {},
    };
    const reset = !previous || previous.id !== next.id || previous.startUrl !== next.startUrl;
    state.profile = next;
    state.validationError = '';
    if (reset) clearPreview();

    try {
      resolveTarget(next.startUrl);
      const source = input.navigation || {};
      if (input.validationError || source.items === null) {
        throw new Error(input.validationError || 'Die Menüeingabe ist noch kein gültiges JSON-Array.');
      }
      const context = { startUrl: next.startUrl, trustedDomain: next.trustedDomain };
      const navigation = window.QuantumNavigationModel.validateNavigation(source, context);
      const items = navigation.items;
      const resolveTree = (list) => list.map((item) => window.QuantumNavigationModel.isGroup(item)
        ? { ...item, label: item.label.slice(0, 40), children: resolveTree(item.children) }
        : { ...item, label: item.label.slice(0, 40), resolvedUrl: resolveTarget(item.url) });
      const resolvedTree = resolveTree(items);
      const resolvedMenus = new Map([['default', resolvedTree],
        ...navigation.menus.map((menu) => [menu.id, resolveTree(menu.items)])]);
      next.navigation = {
        ...navigation,
        resolvedTree,
        resolvedItems: window.QuantumNavigationModel.flattenItems(resolvedTree),
        resolvedMenus,
      };
      // A trust-domain edit must not keep a route that no longer belongs to this app.
      if (!reset && state.currentUrl) {
        try { resolveTarget(state.currentUrl); } catch { clearPreview(); }
      }
      if (!state.currentUrl) navigate(next.startUrl);
      setStatus();
    } catch (error) {
      const sameContext = previous && previous.id === next.id
        && previous.startUrl === next.startUrl && previous.trustedDomain === next.trustedDomain;
      if (sameContext) next.navigation = previous.navigation;
      else clearPreview();
      const message = error.message || 'Die Vorschau braucht eine gültige Startadresse und gültige Menüziele.';
      state.validationError = sameContext ? `Die Vorschau zeigt das letzte gültige Menü. ${message}` : message;
      setStatus(state.validationError);
    }
    renderNavigation();
    window.requestAnimationFrame(refreshStageHeight);
  };

  const refreshStageHeight = () => {
    const target = device();
    const targetStage = stage();
    if (!target || !targetStage) return;
    const scale = state.zoom / 100;
    target.style.transform = `scale(${scale})`;
    targetStage.style.height = `${Math.ceil(target.offsetHeight * scale)}px`;
  };

  const applyZoom = (value, persist = true) => {
    state.zoom = Math.max(0, Math.min(100, Number(value) || 0));
    const slider = $('simulatorZoom');
    const output = $('simulatorZoomValue');
    if (slider) slider.value = String(state.zoom);
    if (output) output.textContent = `${state.zoom}%`;
    refreshStageHeight();
    if (persist) storage.set('qb.sim.zoom', state.zoom);
  };

  const postAudioState = () => {
    const targetFrame = frame();
    if (!targetFrame?.contentWindow) return;
    targetFrame.contentWindow.postMessage({
      source: 'starlight-quantum-builder',
      type: 'quantum:simulator-audio',
      muted: state.muted,
    }, '*');
  };

  const muteSameOriginMedia = () => {
    const targetFrame = frame();
    try {
      const doc = targetFrame?.contentDocument;
      if (!doc) return false;
      doc.querySelectorAll('audio,video').forEach((media) => { media.muted = state.muted; });
      return true;
    } catch {
      return false;
    }
  };

  const reloadFrame = () => {
    if (state.currentUrl) navigate(state.currentUrl);
  };

  const applyMute = (muted, { persist = true, reloadCrossOrigin = false } = {}) => {
    state.muted = Boolean(muted);
    const button = $('simulatorMuteButton');
    const targetFrame = frame();
    if (button) {
      button.classList.toggle('is-muted', state.muted);
      button.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
      button.textContent = state.muted ? 'MUTE' : 'SOUND';
      button.title = state.muted ? 'Simulator ist stumm' : 'Simulator-Audio ist aktiv';
    }
    if (targetFrame) {
      targetFrame.setAttribute('allow', state.muted ? "autoplay 'none'" : 'autoplay');
    }
    postAudioState();
    const sameOrigin = muteSameOriginMedia();
    if (reloadCrossOrigin && !sameOrigin) reloadFrame();
    if (persist) storage.set('qb.sim.muted', state.muted ? '1' : '0');
  };

  const applyDevice = (kind, persist = true) => {
    state.device = kind === 'tablet' ? 'tablet' : 'phone';
    const target = device();
    if (target) target.classList.toggle('sim-tablet', state.device === 'tablet');
    document.querySelectorAll('[data-simulator-device]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.simulatorDevice === state.device);
    });
    if (persist) storage.set('qb.sim.device', state.device);
    window.requestAnimationFrame(refreshStageHeight);
  };

  const applyOrientation = (landscape, persist = true) => {
    state.landscape = Boolean(landscape);
    const target = device();
    const button = $('simulatorRotateButton');
    if (target) target.classList.toggle('sim-landscape', state.landscape);
    if (button) {
      button.classList.toggle('is-active', state.landscape);
      button.title = state.landscape ? 'Auf Hochformat wechseln' : 'Auf Querformat wechseln';
    }
    if (persist) storage.set('qb.sim.landscape', state.landscape ? '1' : '0');
    window.requestAnimationFrame(refreshStageHeight);
  };

  const goHome = () => {
    if (state.profile?.startUrl) navigate(state.profile.startUrl);
  };

  const bind = () => {
    $('simulatorZoom')?.addEventListener('input', (event) => applyZoom(event.target.value));
    $('simulatorMuteButton')?.addEventListener('click', () => applyMute(!state.muted, { reloadCrossOrigin: true }));
    $('simulatorReloadButton')?.addEventListener('click', reloadFrame);
    $('simulatorHomeButton')?.addEventListener('click', goHome);
    $('simulatorRotateButton')?.addEventListener('click', () => applyOrientation(!state.landscape));
    document.querySelectorAll('[data-simulator-device]').forEach((button) => {
      button.addEventListener('click', () => applyDevice(button.dataset.simulatorDevice));
    });
    frame()?.addEventListener('load', () => {
      postAudioState();
      muteSameOriginMedia();
      updateHistoryState();
    });
    window.addEventListener('resize', refreshStageHeight);
    if ('ResizeObserver' in window && device()) {
      new ResizeObserver(refreshStageHeight).observe(device());
    }
  };

  const boot = () => {
    ensureSurfaces();
    bind();
    applyDevice(state.device, false);
    applyOrientation(state.landscape, false);
    applyZoom(state.zoom, false);
    applyMute(state.muted, { persist: false, reloadCrossOrigin: false });
    renderNavigation();
  };

  window.QuantumSimulator = Object.freeze({ updateProfile });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
