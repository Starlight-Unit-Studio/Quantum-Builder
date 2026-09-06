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
  };

  const frame = () => $('simulatorFrame');
  const device = () => $('simulatorDevice');
  const stage = () => $('simulatorStage');

  const simulatorUrl = () => {
    const input = $('startUrl');
    const current = input?.value?.trim();
    if (current && /^https:\/\//i.test(current)) return current;
    const stored = frame()?.dataset?.url;
    return stored && /^https:\/\//i.test(stored) ? stored : '';
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
    const targetFrame = frame();
    if (!targetFrame) return;
    const url = simulatorUrl();
    if (!url) return;
    targetFrame.dataset.url = url;
    targetFrame.src = 'about:blank';
    window.setTimeout(() => { targetFrame.src = url; }, 30);
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
    const targetFrame = frame();
    const url = simulatorUrl();
    if (!targetFrame || !url) return;
    targetFrame.dataset.url = url;
    targetFrame.src = url;
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
    });
    window.addEventListener('resize', refreshStageHeight);
    if ('ResizeObserver' in window && device()) {
      new ResizeObserver(refreshStageHeight).observe(device());
    }
  };

  const boot = () => {
    bind();
    applyDevice(state.device, false);
    applyOrientation(state.landscape, false);
    applyZoom(state.zoom, false);
    applyMute(state.muted, { persist: false, reloadCrossOrigin: false });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
