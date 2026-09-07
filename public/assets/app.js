(() => {
  'use strict';

  const state = {
    csrf: window.QB_BOOT?.csrf || null,
    currentApp: null,
    apps: [],
    buildTimer: null,
    saveTimer: null,
    savePromise: null,
    formRevision: 0,
    savedRevision: 0,
  };

  const $ = (id) => document.getElementById(id);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const api = async (action, options = {}) => {
    const method = options.method || 'GET';
    const url = new URL('/api.php', window.location.origin);
    url.searchParams.set('action', action);
    Object.entries(options.query || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));

    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (state.csrf) headers['X-QB-CSRF'] = state.csrf;
    }

    const response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'invalid_response' }));
    if (!response.ok || !data.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const setAuthenticated = (authenticated) => {
    $('loginScreen').classList.toggle('is-hidden', authenticated);
    $('builderShell').classList.toggle('is-hidden', !authenticated);
  };

  const login = async (event) => {
    event.preventDefault();
    $('loginError').textContent = '';
    try {
      const result = await api('login', {
        method: 'POST',
        body: { email: $('loginEmail').value, password: $('loginPassword').value },
      });
      state.csrf = result.csrf;
      $('loginPassword').value = '';
      setAuthenticated(true);
      await loadApps();
    } catch (error) {
      $('loginError').textContent = error.message === 'invalid_credentials' ? 'Zugangsdaten nicht akzeptiert.' : error.message;
    }
  };

  const logout = async () => {
    if (state.currentApp && state.formRevision > state.savedRevision) {
      const saved = await saveApp({ silent: false });
      if (!saved) return;
    }
    try {
      await api('logout', { method: 'POST' });
    } finally {
      state.csrf = null;
      state.currentApp = null;
      if (state.buildTimer) clearInterval(state.buildTimer);
      if (state.saveTimer) clearTimeout(state.saveTimer);
      setAuthenticated(false);
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  })[char]);

  const appCard = (app) => `
    <article class="terran-panel app-card" data-app-card="${app.id}">
      <div class="app-card__head">
        <div>
          <div class="kicker">APP::${escapeHtml(app.uuid.slice(0, 8).toUpperCase())}</div>
          <div class="app-card__name">${escapeHtml(app.name)}</div>
        </div>
        <span class="chip">READY</span>
      </div>
      <div class="app-card__url">${escapeHtml(app.start_url)}</div>
      <div class="app-card__package">${escapeHtml(app.package_id)}</div>
      <div class="app-card__meta">
        <div class="meta-box"><span>Version</span><strong>${escapeHtml(app.version_name)}</strong></div>
        <div class="meta-box"><span>Next code</span><strong>${app.version_code}</strong></div>
        <div class="meta-box"><span>Android</span><strong>${app.min_sdk} - ${app.target_sdk}</strong></div>
      </div>
      <div class="app-card__actions">
        <button class="btn primary" type="button" data-open-app="${app.id}">Configure</button>
        <button class="btn" type="button" data-build-app="${app.id}">Rebuild</button>
      </div>
    </article>`;

  const renderApps = () => {
    $('appsGrid').innerHTML = state.apps.map(appCard).join('');
    $('emptyApps').classList.toggle('is-hidden', state.apps.length !== 0);
    qsa('[data-open-app]').forEach((button) => button.addEventListener('click', () => openApp(Number(button.dataset.openApp))));
    qsa('[data-build-app]').forEach((button) => button.addEventListener('click', async () => {
      await openApp(Number(button.dataset.buildApp), 'build');
      await queueBuild();
    }));
  };

  const loadApps = async () => {
    const result = await api('apps');
    state.apps = result.apps || [];
    renderApps();
  };

  const createApp = async (event) => {
    event.preventDefault();
    const button = $('createAppButton');
    button.disabled = true;
    try {
      const result = await api('create_app', {
        method: 'POST',
        body: {
          name: $('newAppName').value.trim(),
          start_url: $('newStartUrl').value.trim(),
          package_id: $('newPackageId').value.trim(),
          description: '', version_name: '0.1.0', version_code: 0, min_sdk: 23, target_sdk: 36, config: {},
        },
      });
      $('newAppDialog').close();
      $('newAppForm').reset();
      await loadApps();
      await openApp(result.app.id);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  };

  const get = (obj, path, fallback = '') => path.split('.').reduce((value, key) => (value && value[key] !== undefined ? value[key] : undefined), obj) ?? fallback;

  const resetSaveTracking = () => {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = null;
    state.formRevision = 0;
    state.savedRevision = 0;
    $('saveState').textContent = 'READY';
  };

  const fillForm = (app) => {
    const config = app.config || {};
    $('appId').value = app.id;
    $('appName').value = app.name || '';
    $('startUrl').value = app.start_url || '';
    $('description').value = app.description || '';
    $('trustedDomain').value = get(config, 'trusted_domain', '');
    $('wrapperRef').value = get(config, 'wrapper_ref', 'compat/android-6-api23');
    $('packageId').value = app.package_id || '';
    $('versionName').value = app.version_name || '0.1.0';
    $('versionCode').value = app.version_code ?? 0;
    $('minSdk').value = app.min_sdk || 23;
    $('targetSdk').value = app.target_sdk || 36;

    $('primaryColor').value = get(config, 'theme.primary', '#6fc7ff');
    $('accentColor').value = get(config, 'theme.accent', '#ffd978');
    $('statusBarColor').value = get(config, 'theme.status_bar', '#020611');
    $('navigationBarColor').value = get(config, 'theme.navigation_bar', '#020611');
    $('splashBackground').value = get(config, 'theme.splash_background', '#020611');

    $('darkMode').value = get(config, 'interface.dark_mode', 'dark');
    $('orientation').value = get(config, 'interface.orientation', 'auto');
    $('keepScreenOn').checked = Boolean(get(config, 'interface.keep_screen_on', false));
    $('fullscreen').checked = Boolean(get(config, 'interface.fullscreen', false));
    $('pageTransitions').checked = Boolean(get(config, 'interface.page_transitions', true));
    $('pullToRefresh').checked = Boolean(get(config, 'interface.pull_to_refresh', false));
    $('pinchToZoom').checked = Boolean(get(config, 'interface.pinch_to_zoom', false));
    $('fontScale').value = get(config, 'interface.font_scale', 100);

    $('topBar').checked = Boolean(get(config, 'navigation.top_bar', false));
    $('sidebarNav').checked = Boolean(get(config, 'navigation.sidebar', false));
    $('bottomTabs').checked = Boolean(get(config, 'navigation.bottom_tabs', false));
    $('contextualToolbar').checked = Boolean(get(config, 'navigation.contextual_toolbar', false));

    $('newWindows').value = get(config, 'links.new_windows', 'blocked');
    $('deepLinkScheme').value = get(config, 'links.deep_link_scheme', '');

    $('permLocation').checked = Boolean(get(config, 'permissions.location', false));
    $('permMicrophone').checked = Boolean(get(config, 'permissions.microphone', false));
    $('permCamera').checked = Boolean(get(config, 'permissions.camera', false));
    $('publicDownloads').checked = Boolean(get(config, 'permissions.public_downloads', true));
    $('backgroundAudio').checked = Boolean(get(config, 'permissions.background_audio', false));

    $('userAgentSuffix').value = get(config, 'web.user_agent_suffix', ' QuantumMobileWrapper');
    $('customHeaders').value = JSON.stringify(get(config, 'web.custom_headers', {}), null, 2);
    $('customCss').value = get(config, 'web.custom_css', '');
    $('customJs').value = get(config, 'web.custom_js', '');
    $('cookiePersistence').value = get(config, 'web.cookie_persistence', 'default');

    $('pluginNmp').checked = Boolean(get(config, 'plugins.quantum_nmp', false));
    $('pluginAssetStore').checked = Boolean(get(config, 'plugins.quantum_asset_store', false));
    $('pluginShare').checked = Boolean(get(config, 'plugins.share', false));
    $('pluginHaptics').checked = Boolean(get(config, 'plugins.haptics', false));
    $('pluginBiometrics').checked = Boolean(get(config, 'plugins.biometrics', false));
    $('pluginQr').checked = Boolean(get(config, 'plugins.qr_scanner', false));
    $('pluginFcm').checked = Boolean(get(config, 'plugins.push_fcm', false));

    resetSaveTracking();
    updateSimulator();
  };

  const collectForm = () => {
    let headers = {};
    const rawHeaders = $('customHeaders').value.trim();
    if (rawHeaders) {
      headers = JSON.parse(rawHeaders);
      if (!headers || Array.isArray(headers) || typeof headers !== 'object') throw new Error('Custom Headers müssen ein JSON-Objekt sein.');
    }

    return {
      id: Number($('appId').value),
      name: $('appName').value.trim(),
      start_url: $('startUrl').value.trim(),
      description: $('description').value.trim(),
      package_id: $('packageId').value.trim(),
      version_name: $('versionName').value.trim(),
      version_code: Number($('versionCode').value),
      min_sdk: Number($('minSdk').value),
      target_sdk: Number($('targetSdk').value),
      config: {
        trusted_domain: $('trustedDomain').value.trim(),
        wrapper_ref: $('wrapperRef').value.trim(),
        theme: {
          primary: $('primaryColor').value, accent: $('accentColor').value, status_bar: $('statusBarColor').value,
          navigation_bar: $('navigationBarColor').value, splash_background: $('splashBackground').value,
        },
        interface: {
          dark_mode: $('darkMode').value, orientation: $('orientation').value, keep_screen_on: $('keepScreenOn').checked,
          fullscreen: $('fullscreen').checked, page_transitions: $('pageTransitions').checked,
          pull_to_refresh: $('pullToRefresh').checked, pinch_to_zoom: $('pinchToZoom').checked, font_scale: Number($('fontScale').value),
        },
        navigation: {
          top_bar: $('topBar').checked, sidebar: $('sidebarNav').checked, bottom_tabs: $('bottomTabs').checked,
          contextual_toolbar: $('contextualToolbar').checked,
        },
        links: { new_windows: $('newWindows').value, deep_link_scheme: $('deepLinkScheme').value.trim() },
        permissions: {
          location: $('permLocation').checked, microphone: $('permMicrophone').checked, camera: $('permCamera').checked,
          public_downloads: $('publicDownloads').checked, background_audio: $('backgroundAudio').checked,
        },
        web: {
          user_agent_suffix: $('userAgentSuffix').value, custom_headers: headers, custom_css: $('customCss').value,
          custom_js: $('customJs').value, cookie_persistence: $('cookiePersistence').value,
        },
        plugins: {
          quantum_nmp: $('pluginNmp').checked, quantum_asset_store: $('pluginAssetStore').checked,
          share: $('pluginShare').checked, haptics: $('pluginHaptics').checked, biometrics: $('pluginBiometrics').checked,
          qr_scanner: $('pluginQr').checked, push_fcm: $('pluginFcm').checked,
        },
      },
    };
  };

  const scheduleSave = (delay = 700) => {
    if (!state.currentApp) return;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null;
      saveApp({ silent: true }).catch(() => {});
    }, delay);
  };

  const markDirty = () => {
    if (!state.currentApp) return;
    state.formRevision += 1;
    $('saveState').textContent = 'UNSAVED';
    scheduleSave();
  };

  const saveApp = async ({ silent = false, force = false } = {}) => {
    if (!state.currentApp) return true;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }

    if (state.savePromise) {
      await state.savePromise;
      if (!force && state.savedRevision >= state.formRevision) return true;
    }

    if (!force && state.savedRevision >= state.formRevision) return true;

    let payload;
    try {
      payload = collectForm();
    } catch (error) {
      $('saveState').textContent = 'CHECK INPUT';
      if (!silent) alert(error.message);
      return false;
    }

    const revision = state.formRevision;
    $('saveState').textContent = 'SAVING';
    $('saveAppButton').disabled = true;

    const request = api('save_app', { method: 'POST', body: payload });
    state.savePromise = request;
    try {
      const result = await request;
      state.currentApp = result.app;
      const appIndex = state.apps.findIndex((app) => app.id === result.app.id);
      if (appIndex >= 0) state.apps[appIndex] = result.app;
      $('editorTitle').textContent = result.app.name;
      state.savedRevision = Math.max(state.savedRevision, revision);

      if (state.formRevision === revision) {
        $('saveState').textContent = 'SAVED';
        setTimeout(() => {
          if (state.formRevision === state.savedRevision && $('saveState').textContent === 'SAVED') {
            $('saveState').textContent = 'READY';
          }
        }, 900);
      } else {
        $('saveState').textContent = 'UNSAVED';
        scheduleSave(200);
      }
      return true;
    } catch (error) {
      $('saveState').textContent = 'ERROR';
      if (!silent) alert(error.message);
      return false;
    } finally {
      state.savePromise = null;
      $('saveAppButton').disabled = false;
    }
  };

  const openApp = async (id, section = 'overview') => {
    const result = await api('app', { query: { id } });
    state.currentApp = result.app;
    fillForm(result.app);
    $('editorTitle').textContent = result.app.name;
    $('editorKicker').textContent = `APP::${result.app.uuid.slice(0, 12).toUpperCase()}`;
    $('appsView').classList.add('is-hidden');
    $('editorView').classList.remove('is-hidden');
    $('appNav').classList.remove('is-hidden');
    showSection(section);
    await loadBuilds();
    if (state.buildTimer) clearInterval(state.buildTimer);
    state.buildTimer = setInterval(() => {
      if (state.currentApp && !$('editorView').classList.contains('is-hidden')) loadBuilds().catch(() => {});
    }, 4000);
    closeMobileNav();
  };

  const showApps = async () => {
    if (state.currentApp && state.formRevision > state.savedRevision) {
      const saved = await saveApp({ silent: false });
      if (!saved) return;
    }
    state.currentApp = null;
    resetSaveTracking();
    if (state.buildTimer) clearInterval(state.buildTimer);
    $('editorView').classList.add('is-hidden');
    $('appsView').classList.remove('is-hidden');
    $('appNav').classList.add('is-hidden');
    await loadApps();
    closeMobileNav();
  };

  const showSection = (section) => {
    if (state.currentApp && state.formRevision > state.savedRevision) scheduleSave(0);
    qsa('[data-editor-section]').forEach((el) => el.classList.toggle('is-hidden', el.dataset.editorSection !== section));
    qsa('[data-section]').forEach((el) => el.classList.toggle('is-active', el.dataset.section === section));
    if (section === 'build') loadBuilds().catch(() => {});
    closeMobileNav();
  };

  const queueBuild = async () => {
    if (!state.currentApp) return;
    const saved = await saveApp({ silent: false, force: true });
    if (!saved) return;
    $('rebuildAllButton').disabled = true;
    try {
      const result = await api('queue_build', { method: 'POST', body: { app_id: state.currentApp.id } });
      if (result.app) {
        state.currentApp = result.app;
        $('versionCode').value = result.app.version_code;
        const appIndex = state.apps.findIndex((app) => app.id === result.app.id);
        if (appIndex >= 0) state.apps[appIndex] = result.app;
      }
      await loadBuilds();
    } catch (error) {
      alert(error.message);
    } finally {
      $('rebuildAllButton').disabled = false;
    }
  };

  const buildRow = (build) => {
    const complete = build.status === 'complete';
    const links = complete ? `
      <a class="btn compact" href="/download.php?build=${build.id}&artifact=apk">APK</a>
      <a class="btn compact" href="/download.php?build=${build.id}&artifact=aab">AAB</a>
      <a class="btn compact" href="/download.php?build=${build.id}&artifact=source">SOURCE</a>
      <a class="btn compact" href="/download.php?build=${build.id}&artifact=sha256">SHA256</a>` : '';
    return `<div class="build-row is-${escapeHtml(build.status)}">
      <div class="build-id">#${build.id}</div>
      <div class="build-copy"><strong>${escapeHtml(build.status.toUpperCase())} · ${escapeHtml(build.stage)}</strong><span>${escapeHtml(build.message || '')}</span></div>
      <div class="build-actions">${links}</div>
    </div>`;
  };

  const loadBuilds = async () => {
    if (!state.currentApp) return;
    const result = await api('builds', { query: { app_id: state.currentApp.id } });
    $('buildList').innerHTML = (result.builds || []).map(buildRow).join('') || '<div class="muted">Noch kein Build vorhanden.</div>';
  };

  const updateSimulator = () => {
    const name = $('appName')?.value?.trim() || state.currentApp?.name || 'APP PREVIEW';
    const url = $('startUrl')?.value?.trim() || state.currentApp?.start_url || '';
    $('simAppName').textContent = name;
    $('simPackage').textContent = $('packageId')?.value || state.currentApp?.package_id || 'package';
    $('simVersion').textContent = $('versionName')?.value || state.currentApp?.version_name || 'version';
    const frame = $('simulatorFrame');
    const fallback = $('simFallback');
    if (/^https:\/\//i.test(url)) {
      if (frame.dataset.url !== url) {
        frame.dataset.url = url;
        frame.src = url;
      }
      fallback.classList.add('is-hidden');
    } else {
      frame.removeAttribute('src');
      fallback.classList.remove('is-hidden');
    }
  };

  const persistOnPageHide = () => {
    if (!state.currentApp || !state.csrf || state.formRevision <= state.savedRevision) return;
    let payload;
    try {
      payload = collectForm();
    } catch {
      return;
    }
    fetch('/api.php?action=save_app', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-QB-CSRF': state.csrf,
      },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const openMobileNav = () => $('sidebar').classList.toggle('is-open');
  const closeMobileNav = () => $('sidebar').classList.remove('is-open');

  const bind = () => {
    $('loginForm').addEventListener('submit', login);
    $('logoutButton').addEventListener('click', logout);
    $('newAppButton').addEventListener('click', () => $('newAppDialog').showModal());
    $('newAppForm').addEventListener('submit', createApp);
    $('backToApps').addEventListener('click', showApps);
    $('saveAppButton').addEventListener('click', () => saveApp({ silent: false, force: true }));
    $('rebuildAllButton').addEventListener('click', queueBuild);
    $('mobileNavToggle').addEventListener('click', openMobileNav);

    const versionCodeField = $('versionCode');
    versionCodeField.readOnly = true;
    versionCodeField.setAttribute('aria-readonly', 'true');
    versionCodeField.title = 'Wird bei jedem Build automatisch erhöht.';

    qsa('[data-section]').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));
    qsa('#appForm input, #appForm select, #appForm textarea').forEach((input) => {
      input.addEventListener('change', () => {
        updateSimulator();
        markDirty();
      });
    });
    qsa('#appForm input, #appForm textarea').forEach((input) => {
      input.addEventListener('input', () => {
        updateSimulator();
        markDirty();
      });
    });
    window.addEventListener('pagehide', persistOnPageHide);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMobileNav(); });
  };

  const boot = async () => {
    bind();
    if (!window.QB_BOOT?.authenticated) return;
    try {
      const session = await api('session');
      state.csrf = session.csrf;
      setAuthenticated(Boolean(session.authenticated));
      if (session.authenticated) await loadApps();
    } catch {
      setAuthenticated(false);
    }
  };

  boot();
})();