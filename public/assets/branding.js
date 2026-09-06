(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const kinds = ['icon', 'splash'];

  const assetElements = (kind) => ({
    input: $(`${kind}AssetInput`),
    choose: $(`${kind}AssetChoose`),
    remove: $(`${kind}AssetRemove`),
    preview: $(`${kind}AssetPreview`),
    empty: $(`${kind}AssetEmpty`),
    status: $(`${kind}AssetStatus`),
  });

  const currentAppId = () => Number($('appId')?.value || 0);

  const json = async (response) => {
    const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };

  const sessionCsrf = async () => {
    const data = await json(await fetch('/api.php?action=session', { credentials: 'same-origin', cache: 'no-store' }));
    if (!data.authenticated || !data.csrf) throw new Error('Session nicht verfügbar.');
    return data.csrf;
  };

  const setStatus = (kind, message, type = '') => {
    const { status } = assetElements(kind);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-ok', type === 'ok');
    status.classList.toggle('is-bad', type === 'bad');
  };

  const renderKind = (app, kind) => {
    const elements = assetElements(kind);
    if (!elements.preview) return;
    const asset = app?.config?.branding?.assets?.[kind] || null;
    const appId = Number(app?.id || currentAppId());
    if (asset && appId) {
      elements.preview.src = `/branding-asset.php?app_id=${encodeURIComponent(appId)}&kind=${encodeURIComponent(kind)}&v=${encodeURIComponent(asset.updated_at || Date.now())}`;
      elements.preview.classList.remove('is-hidden');
      elements.empty.classList.add('is-hidden');
      elements.remove.disabled = false;
      setStatus(kind, `${asset.width || '?'}×${asset.height || '?'} · ${asset.mime || 'image'}`, 'ok');
    } else {
      elements.preview.removeAttribute('src');
      elements.preview.classList.add('is-hidden');
      elements.empty.classList.remove('is-hidden');
      elements.remove.disabled = true;
      setStatus(kind, kind === 'icon' ? 'Kein eigenes App-Icon gesetzt.' : 'Kein eigenes Splash-Bild gesetzt.');
    }
  };

  const render = (app) => kinds.forEach((kind) => renderKind(app, kind));

  const loadCurrent = async () => {
    const appId = currentAppId();
    if (!appId) return;
    try {
      const data = await json(await fetch(`/api.php?action=app&id=${encodeURIComponent(appId)}`, {
        credentials: 'same-origin', cache: 'no-store',
      }));
      render(data.app);
    } catch (error) {
      kinds.forEach((kind) => setStatus(kind, error.message, 'bad'));
    }
  };

  const upload = async (kind, file) => {
    const appId = currentAppId();
    if (!appId || !file) return;
    const elements = assetElements(kind);
    elements.choose.disabled = true;
    elements.remove.disabled = true;
    setStatus(kind, 'UPLOAD...');
    try {
      const csrf = await sessionCsrf();
      const form = new FormData();
      form.set('app_id', String(appId));
      form.set('kind', kind);
      form.set('operation', 'upload');
      form.set('file', file);
      const data = await json(await fetch('/branding-asset.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-QB-CSRF': csrf },
        body: form,
      }));
      render(data.app);
    } catch (error) {
      setStatus(kind, error.message, 'bad');
    } finally {
      elements.input.value = '';
      elements.choose.disabled = false;
    }
  };

  const remove = async (kind) => {
    const appId = currentAppId();
    if (!appId) return;
    const elements = assetElements(kind);
    elements.choose.disabled = true;
    elements.remove.disabled = true;
    setStatus(kind, 'REMOVE...');
    try {
      const csrf = await sessionCsrf();
      const form = new FormData();
      form.set('app_id', String(appId));
      form.set('kind', kind);
      form.set('operation', 'delete');
      const data = await json(await fetch('/branding-asset.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-QB-CSRF': csrf },
        body: form,
      }));
      render(data.app);
    } catch (error) {
      setStatus(kind, error.message, 'bad');
    } finally {
      elements.choose.disabled = false;
    }
  };

  const bindKind = (kind) => {
    const elements = assetElements(kind);
    if (!elements.input || !elements.choose || !elements.remove) return;
    elements.choose.addEventListener('click', () => elements.input.click());
    elements.input.addEventListener('change', () => upload(kind, elements.input.files?.[0]));
    elements.remove.addEventListener('click', () => remove(kind));
  };

  const boot = () => {
    kinds.forEach(bindKind);
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-section="branding"]');
      if (button) queueMicrotask(loadCurrent);
    });
    window.addEventListener('focus', () => {
      const section = document.querySelector('[data-editor-section="branding"]');
      if (section && !section.classList.contains('is-hidden')) loadCurrent();
    });
  };

  boot();
})();
