((root, factory) => {
  'use strict';
  const icons = factory();
  if (typeof module === 'object' && module.exports) module.exports = icons;
  if (root) root.QuantumNavigationIcons = icons;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  // Original Quantum outline drawings. Android uses these same 24-unit paths.
  const CATALOG = Object.freeze([
    { id: 'home', label: 'Startseite', path: 'M3 10L12 3L21 10V21H15V14H9V21H3Z' },
    { id: 'search', label: 'Suche', path: 'M18 10A8 8 0 1 1 2 10A8 8 0 1 1 18 10M16 16L22 22' },
    { id: 'grid', label: 'Übersicht', path: 'M3 3H9V9H3ZM15 3H21V9H15ZM3 15H9V21H3ZM15 15H21V21H15Z' },
    { id: 'star', label: 'Stern', path: 'M12 2L15.1 8.3L22 9.3L17 14.2L18.2 21.1L12 17.8L5.8 21.1L7 14.2L2 9.3L8.9 8.3Z' },
    { id: 'heart', label: 'Favoriten', path: 'M12 21L3.5 12.5C-1 8 4 1 9 4L12 7L15 4C20 1 25 8 20.5 12.5Z' },
    { id: 'user', label: 'Profil', path: 'M16 7A4 4 0 1 1 8 7A4 4 0 1 1 16 7M4 21V19C4 12.3 20 12.3 20 19V21' },
    { id: 'settings', label: 'Einstellungen', path: 'M4 5H20M4 12H20M4 19H20M8 2V8M16 9V15M10 16V22' },
    { id: 'info', label: 'Information', path: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M12 10V17M12 6V6.2' },
    { id: 'mail', label: 'Nachrichten', path: 'M3 4H21V20H3ZM3 5L12 12L21 5' },
    { id: 'cart', label: 'Warenkorb', path: 'M2 3H5L8 16H19L22 7H6M11 21A1 1 0 1 1 9 21A1 1 0 1 1 11 21M19 21A1 1 0 1 1 17 21A1 1 0 1 1 19 21' },
    { id: 'calendar', label: 'Kalender', path: 'M3 5H21V22H3ZM3 10H21M7 2V7M17 2V7M7 14H9M15 14H17M7 18H9' },
    { id: 'camera', label: 'Kamera', path: 'M3 6H7L9 3H15L17 6H21V21H3ZM16 13A4 4 0 1 1 8 13A4 4 0 1 1 16 13' },
    { id: 'map', label: 'Karte', path: 'M4 10C4-0.7 20-0.7 20 10C20 15 12 22 12 22C12 22 4 15 4 10ZM15 9A3 3 0 1 1 9 9A3 3 0 1 1 15 9' },
    { id: 'phone', label: 'Telefon', path: 'M4 2H8L10 7L7 9C9 13 11 15 15 17L17 14L22 16V20C22 26 0 12 2 4Z' },
    { id: 'download', label: 'Download', path: 'M12 2V16M6 10L12 16L18 10M3 16V22H21V16' },
    { id: 'help', label: 'Hilfe', path: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M8 8C8 3 17 3 16 9C15.5 12 12 11 12 15M12 18V18.2' },
    { id: 'play', label: 'Wiedergabe', path: 'M6 3L21 12L6 21Z' },
    { id: 'folder', label: 'Ordner', path: 'M2 4H9L12 7H22V21H2ZM2 10H22' },
    { id: 'globe', label: 'Web', path: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M12 2C5 7 5 17 12 22C19 17 19 7 12 2M2 12H22M4 6H20M4 18H20' },
    { id: 'link', label: 'Verknüpfung', path: 'M9 15L15 9M8 12L5 15C1 19 5 23 9 19L12 16M12 8L15 5C19 1 23 5 19 9L16 12' },
  ].map(Object.freeze));
  const byId = new Map(CATALOG.map((icon) => [icon.id, icon]));
  const MAX_PNG_BYTES = 65536;
  const MAX_PNG_DIMENSION = 256;
  const PREFIX = 'data:image/png;base64,';
  const cache = new Map();
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  const crc32 = (bytes, start, end) => {
    let crc = 0xffffffff;
    for (let index = start; index < end; index++) crc = crcTable[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const invalidPng = () => new Error('Das eigene Icon muss eine gültige, statische PNG-Datei mit maximal 64 KiB und 256 × 256 Pixeln sein.');

  const validate = (input) => {
    if (input === undefined || input === '') return '';
    if (typeof input !== 'string') throw new Error('Icons müssen als Symbolname oder PNG-Datei angegeben werden.');
    const value = input.trim();
    if (!value || byId.has(value)) return value;
    if (value.length > PREFIX.length + Math.ceil(MAX_PNG_BYTES / 3) * 4 || !value.startsWith(PREFIX)) {
      throw new Error('Bitte ein verfügbares Symbol oder ein eigenes PNG-Icon wählen.');
    }
    if (cache.has(value)) return value;
    const encoded = value.slice(PREFIX.length);
    if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw invalidPng();
    let binary;
    try { binary = atob(encoded); } catch { throw invalidPng(); }
    if (btoa(binary) !== encoded || binary.length < 57 || binary.length > MAX_PNG_BYTES) throw invalidPng();
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte)) throw invalidPng();
    let offset = 8;
    let sawHeader = false;
    let palette = false;
    let colorType = 0;
    let dataLength = 0;
    let dataEnded = false;
    let sawEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const end = offset + 8 + length;
      if (end + 4 > bytes.length) throw invalidPng();
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (!/^[A-Za-z]{4}$/.test(type) || type === 'acTL'
        || crc32(bytes, offset + 4, end) !== view.getUint32(end)) throw invalidPng();
      if (!sawHeader && type !== 'IHDR') throw invalidPng();
      if (type === 'IHDR') {
        if (sawHeader || length !== 13) throw invalidPng();
        const width = view.getUint32(offset + 8);
        const height = view.getUint32(offset + 12);
        const depth = bytes[offset + 16];
        const color = bytes[offset + 17];
        const allowedDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (width < 1 || height < 1 || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION
          || !allowedDepths[color]?.includes(depth) || bytes[offset + 18] !== 0
          || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) throw invalidPng();
        sawHeader = true;
        colorType = color;
      } else if (type === 'PLTE') {
        if (palette || dataLength || length < 1 || length > 768 || length % 3) throw invalidPng();
        palette = true;
      } else if (type === 'IDAT') {
        if (dataEnded || (colorType === 3 && !palette)) throw invalidPng();
        dataLength += length;
      } else if (type === 'IEND') {
        if (length !== 0 || !dataLength || end + 4 !== bytes.length) throw invalidPng();
        sawEnd = true;
        break;
      } else {
        if (/^[A-Z]/.test(type)) throw invalidPng();
        if (dataLength) dataEnded = true;
      }
      offset = end + 4;
    }
    if (!sawHeader || !dataLength || !sawEnd) throw invalidPng();
    // At most 24 normal/active images per profile; bound cross-profile memory.
    if (cache.size >= 48) cache.delete(cache.keys().next().value);
    cache.set(value, true);
    return value;
  };

  const createElement = (input, { className = '' } = {}) => {
    const value = validate(input);
    if (!value) return null;
    let node;
    if (byId.has(value)) {
      const ns = 'http://www.w3.org/2000/svg';
      node = document.createElementNS(ns, 'svg');
      node.setAttribute('viewBox', '0 0 24 24');
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', 'currentColor');
      node.setAttribute('stroke-width', '1.8');
      node.setAttribute('stroke-linecap', 'round');
      node.setAttribute('stroke-linejoin', 'round');
      node.setAttribute('focusable', 'false');
      node.dataset.icon = value;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', byId.get(value).path);
      node.append(path);
    } else {
      node = document.createElement('img');
      node.src = value;
      node.alt = '';
      node.draggable = false;
      node.dataset.icon = 'custom';
    }
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('width', '22');
    node.setAttribute('height', '22');
    if (className) node.setAttribute('class', className);
    return node;
  };

  return Object.freeze({ CATALOG, MAX_PNG_BYTES, MAX_PNG_DIMENSION, validate, createElement });
});
