'use strict';

// Browser regression for the actual Builder UI. API and embedded website are
// isolated fixtures; no authenticated server, Android build or external request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const origin = 'http://quantum-builder.test';
const website = 'https://app.example.test';
const menu = [
  { label: 'Home', url: '/' }, { label: 'News', url: '/news?tab=2' },
  { label: 'Library', url: '/library' }, { label: 'Account', url: '/account' },
  { label: 'Help', url: '/help' }, { label: 'Settings', url: '/settings' },
];
const makeApp = (id, items) => ({
  id, uuid: `qa-app-${id}-00000000`, name: `Navigation QA ${id}`,
  start_url: website + '/app/index.html', package_id: `test.quantum.app${id}`,
  description: '', version_name: '0.1.0', version_code: 7, min_sdk: 23, target_sdk: 36,
  config: { trusted_domain: 'example.test', navigation: {
    top_bar: true, sidebar: true, bottom_tabs: true, contextual_toolbar: true,
    title: `QA Menu ${id}`, background: '#102030', foreground: '#ffffff', accent: '#6fc7ff', items,
  } },
});
const apps = [makeApp(1, structuredClone(menu)), makeApp(2, [{ label: 'Second', url: '/second' }])];
const saves = [];
const websiteLoads = [];
const errors = [];
let buildRequests = 0;

let html = fs.readFileSync(path.join(root, 'public/index.php'), 'utf8')
  .replace(/^<\?php[\s\S]*?\?>\s*/, '')
  .replaceAll("<?= $authenticated ? ' is-hidden' : '' ?>", ' is-hidden')
  .replaceAll("<?= $authenticated ? '' : ' is-hidden' ?>", '')
  .replace(/<\?= htmlspecialchars\(Config::version\(\), ENT_QUOTES\) \?>/g, version)
  .replace(/<\?= json_encode\([\s\S]*?\?>/, JSON.stringify({ authenticated: true, csrf: 'qa-token', version }));
assert.ok(!html.includes('<?'), 'The fixture must render every PHP expression explicitly.');

const png = (width = 2, height = 2) => {
  const chunk = (type, data) => {
    const bytes = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, bytes, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1), 0xff);
  for (let row = 0; row < height; row++) pixels[row * (width * 4 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
const customPng = png();
const customIcon = 'data:image/png;base64,' + customPng.toString('base64');

const waitFor = async (check, message) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.QB_BROWSER_EXECUTABLE ? { executablePath: process.env.QB_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === website) {
        websiteLoads.push(url.href);
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Preview website</h1><p>Isolated navigation fixture.</p></body></html>' });
        return;
      }
      if (url.origin !== origin) { await route.abort(); return; }
      if (url.pathname === '/api.php') {
        const action = url.searchParams.get('action');
        let result = { ok: true };
        if (action === 'session') result = { ...result, authenticated: true, csrf: 'qa-token' };
        else if (action === 'apps') result.apps = apps;
        else if (action === 'app') result.app = apps.find(app => app.id === Number(url.searchParams.get('id')));
        else if (action === 'builds') result.builds = [];
        else if (action === 'save_app') {
          const payload = request.postDataJSON();
          const app = apps.find(item => item.id === payload.id);
          saves.push(structuredClone(payload));
          Object.assign(app, payload);
          result.app = app;
        } else if (action === 'queue_build') {
          buildRequests += 1;
          result = { ok: false, message: 'Builds are disabled in the browser fixture.' };
        } else if (action !== 'logout') throw new Error(`Unexpected fixture API: ${action}`);
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
        return;
      }
      if (url.pathname.startsWith('/assets/')) {
        const filename = path.resolve(root, 'public', '.' + url.pathname);
        assert.ok(filename.startsWith(path.join(root, 'public/assets') + path.sep));
        await route.fulfill({ path: filename, contentType: filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : undefined });
        return;
      }
      await route.fulfill({ contentType: 'text/html', body: html });
    });

    const openApp = async id => {
      await page.locator(`[data-open-app="${id}"]`).click();
      await page.locator('[data-section="navigation"]').click();
      await page.locator('.qb-nav-editor__row').first().waitFor();
    };
    const rows = page.locator('.qb-nav-editor__row');
    const raw = page.locator('#nativeNavigationItems');
    const sourceValue = () => raw.inputValue();
    const currentUrl = () => page.locator('#simulatorFrame').getAttribute('data-preview-url');
    const setRaw = async items => {
      await page.locator('#nativeNavigationJson').evaluate(node => { node.open = true; });
      await raw.fill(typeof items === 'string' ? items : JSON.stringify(items));
    };
    const flush = async () => {
      const before = saves.length;
      await page.locator('#saveAppButton').click();
      await waitFor(() => saves.length > before, 'Profile save was not issued.');
    };
    const oneChange = async (action, message) => {
      const before = await page.evaluate(() => window.navigationInputEvents);
      await action();
      assert.equal(await page.evaluate(() => window.navigationInputEvents), before + 1, message);
    };
    const groupRow = id => page.locator(`.qb-nav-editor__row[data-navigation-group-id="${id}"]`);
    const groupToggle = id => page.locator(`.sim-native-group-toggle[data-group-id="${id}"]`);
    const rowNamed = async label => {
      const key = await rows.evaluateAll((nodes, label) => nodes.find(node => node.querySelector('[data-navigation-field="label"]').value === label)?.dataset.navigationKey, label);
      assert.ok(key, `Missing editor row ${label}`);
      return page.locator(`.qb-nav-editor__row[data-navigation-key="${key}"]`);
    };
    const checkEditorLayout = async (width, description) => {
      await page.setViewportSize({ width, height: 1000 });
      if (width <= 820) await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right <= 0);
      const geometry = await page.locator('#nativeNavigationEditor').evaluate(node => {
        const rect = node.getBoundingClientRect();
        const rowOverflow = [...node.querySelectorAll('.qb-nav-editor__row')].filter(row => row.scrollWidth > row.clientWidth + 1).length;
        const shortControls = [...node.querySelectorAll('button, select, input:not([type="checkbox"]):not([type="file"])')]
          .filter(control => control.getClientRects().length && control.getBoundingClientRect().height < 43).length;
        return { left: rect.left, right: rect.right, width: node.clientWidth, content: node.scrollWidth, rowOverflow, shortControls };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1, `${description} outside viewport at ${width}px: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.content <= geometry.width + 1, `${description} overflows internally at ${width}px.`);
      assert.equal(geometry.rowOverflow, 0, `${description} has an overflowing row at ${width}px.`);
      assert.equal(geometry.shortControls, 0, `${description} has controls below the 44px touch target at ${width}px.`);
    };
    const checkGroupEdgeCases = async () => {
      await setRaw([
        { label: 'Outside', url: '/outside' },
        { type: 'group', id: 'edge-active', label: 'Active group', collapsed: true, children: [{ label: 'Inside', url: '/inside' }] },
        { type: 'group', id: 'edge-idle', label: 'Idle group', collapsed: true, children: [] },
        { label: 'Last', url: '/last' },
      ]);
      await page.locator('.sim-native-tab').nth(1).click();
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'true');
      await page.getByRole('button', { name: 'Seitenmenü der Vorschau öffnen', exact: true }).click();
      await groupToggle('edge-active').click();
      await page.keyboard.press('Escape');
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'false');
      await oneChange(() => page.getByRole('button', { name: 'Gruppe hinzufügen', exact: true }).click(), 'Adding an unrelated group must emit one canonical change.');
      const unrelatedId = JSON.parse(await sourceValue()).at(-1).id;
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'false', 'Adding an unrelated empty group must preserve a manually collapsed active branch.');
      await groupRow(unrelatedId).getByRole('button', { name: 'Neue Gruppe auflösen und Einträge behalten', exact: true }).click();
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'false', 'Removing an unrelated empty group must preserve a manually collapsed active branch.');
      await groupRow('edge-idle').getByRole('button', { name: 'Idle group nach oben verschieben', exact: true }).click();
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'false', 'Reordering an unrelated sibling must preserve a manually collapsed active branch.');
      const idleKey = await groupRow('edge-idle').getAttribute('data-navigation-key');
      const inside = await rowNamed('Inside');
      await inside.locator('[data-navigation-field="parent"]').selectOption(idleKey);
      assert.equal(await groupToggle('edge-idle').getAttribute('aria-expanded'), 'true', 'Moving the current page into a previously inactive group must reveal that new active parent.');
      assert.equal(await groupToggle('edge-active').getAttribute('aria-expanded'), 'false');
      assert.equal(await currentUrl(), website + '/inside');
      for (const ending of ['\n', '\r', '\u2028', '\u2029']) {
        const draft = JSON.stringify([{ type: 'group', id: 'strict-id' + ending, label: 'Invalid ID', children: [] }]);
        await setRaw(draft);
        assert.equal(await sourceValue(), draft, 'A group ID containing terminal whitespace must not be silently trimmed.');
        assert.equal(await rows.first().locator('.qb-nav-editor__row-error').isVisible(), true, 'Every terminal linebreak in a group ID must produce a visible row error.');
      }
      await page.waitForFunction(() => document.getElementById('saveState').textContent === 'CHECK INPUT');
    };

    await page.goto(origin);
    await openApp(1);
    assert.equal(await rows.count(), 6);
    assert.equal(await page.locator('.sim-native-tab').count(), 5);
    assert.equal(await page.locator('.sim-native-item').count(), 6);
    assert.equal(saves.length, 0, 'Hydrating a profile must not mark it dirty.');
    if (process.env.QB_NAVIGATION_EDGE_CASES === '1') {
      await raw.evaluate(node => {
        window.navigationInputEvents = 0;
        node.addEventListener('input', () => { window.navigationInputEvents += 1; });
      });
      await checkGroupEdgeCases();
      assert.deepEqual(errors, [], 'Group edge cases must not throw browser errors.');
      console.log('PASS: strict group IDs, unchanged invalid JSON, manual collapse across unrelated additions/removal/reorder, newly active parent reveal, canonical group changes.');
      return;
    }

    const firstLabel = rows.first().locator('[data-navigation-field="label"]');
    await firstLabel.fill('Übersicht');
    assert.equal(await firstLabel.evaluate(node => node === document.activeElement), true);
    await waitFor(() => saves.some(save => save.config.navigation.items[0]?.label === 'Übersicht'), 'Autosave did not persist a visual edit.');
    assert.equal(await page.locator('.sim-native-tab').first().textContent(), 'Übersicht');

    await raw.evaluate(node => {
      window.navigationInputEvents = 0;
      node.addEventListener('input', () => { window.navigationInputEvents += 1; });
    });
    await rows.first().locator('[data-navigation-field="icon"]').selectOption('home');
    await rows.first().locator('[data-navigation-field="active_icon"]').selectOption('heart');
    assert.equal(await page.evaluate(() => window.navigationInputEvents), 2, 'Each icon selection must emit exactly one canonical change.');
    assert.equal(JSON.parse(await sourceValue())[0].icon, 'home');
    assert.equal(JSON.parse(await sourceValue())[0].active_icon, 'heart');
    assert.equal(await rows.first().locator('.qb-nav-editor__icon-preview [data-icon="home"]').count(), 1);
    await page.locator('.sim-native-tab').first().click();
    assert.equal(await page.locator('.sim-native-tab').first().locator('[data-icon="heart"]').count(), 1, 'The active tab uses its selected icon.');
    assert.equal(await page.locator('.sim-native-item').first().locator('[data-icon="heart"]').count(), 1, 'Sidebar selection uses the same active icon.');
    await page.locator('.sim-native-tab').nth(1).click();
    assert.equal(await page.locator('.sim-native-tab').first().locator('[data-icon="home"]').count(), 1, 'Leaving the route restores the normal icon.');
    await rows.first().getByRole('button', { name: 'Übersicht nach unten verschieben', exact: true }).click();
    assert.equal(JSON.parse(await sourceValue())[1].active_icon, 'heart', 'Reordering preserves the icon pair.');
    await rows.nth(1).getByRole('button', { name: 'Übersicht nach oben verschieben', exact: true }).click();
    await rows.first().locator('[data-navigation-upload="icon"]').setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer: customPng });
    await page.waitForFunction(expected => JSON.parse(document.getElementById('nativeNavigationItems').value)[0].icon === expected, customIcon);
    assert.equal(await rows.first().locator('.qb-nav-editor__icon-preview img[data-icon="custom"]').count(), 1);
    await rows.first().getByRole('button', { name: 'Aktives Icon für Übersicht zurücksetzen', exact: true }).click();
    assert.equal(JSON.parse(await sourceValue())[0].active_icon, undefined, 'Resetting the active icon restores inheritance.');
    await page.locator('.sim-native-tab').first().click();
    assert.equal(await page.locator('.sim-native-tab').first().locator('img[data-icon="custom"]').getAttribute('src'), customIcon);
    await flush();
    assert.equal(saves.at(-1).config.navigation.items[0].icon, customIcon, 'The profile stores the custom image without dropping it.');
    const beforeRejectedUpload = await sourceValue();
    for (const fixture of [
      { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') },
      { name: 'oversize.png', mimeType: 'image/png', buffer: Buffer.alloc(65537) },
      { name: 'wide.png', mimeType: 'image/png', buffer: png(257, 1) },
    ]) {
      await rows.first().locator('[data-navigation-upload="icon"]').setInputFiles(fixture);
      await rows.first().locator('.qb-nav-editor__row-error').waitFor({ state: 'visible' });
      assert.equal(await sourceValue(), beforeRejectedUpload, 'A rejected file must not replace the previous valid icon.');
    }
    await rows.first().getByRole('button', { name: 'Normales Icon für Übersicht zurücksetzen', exact: true }).click();
    assert.equal(JSON.parse(await sourceValue())[0].icon, undefined);
    assert.equal(await rows.first().locator('.qb-nav-editor__row-error').isVisible(), false);
    await rows.first().locator('[data-navigation-field="icon"]').selectOption('home');
    await rows.first().locator('[data-navigation-field="active_icon"]').selectOption('heart');

    await page.getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).click();
    assert.equal(await rows.count(), 7);
    await rows.last().locator('[data-navigation-field="label"]').fill('Extra');
    await rows.last().locator('[data-navigation-field="url"]').fill('/extra');
    await rows.last().getByRole('button', { name: 'Extra nach oben verschieben', exact: true }).click();
    assert.equal(JSON.parse(await sourceValue())[5].label, 'Extra');
    await rows.nth(5).getByRole('button', { name: 'Extra entfernen', exact: true }).click();
    assert.equal(await rows.count(), 6);
    await flush();

    const savedBeforeInvalid = JSON.stringify(apps[0].config.navigation.items);
    await setRaw('[{"label":');
    assert.equal(await sourceValue(), '[{"label":');
    assert.equal(await page.getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => document.getElementById('saveState').textContent === 'CHECK INPUT');

    await page.locator('[data-section="build"]').click();
    await page.locator('#rebuildAllButton').click();
    assert.equal(buildRequests, 0, 'Invalid menu destinations must block build queueing.');
    await page.locator('[data-section="navigation"]').click();
    assert.equal(JSON.stringify(apps[0].config.navigation.items), savedBeforeInvalid, 'Invalid JSON must not save an empty replacement.');
    assert.equal(await page.locator('.sim-native-tab').count(), 5, 'Keep the last valid preview during an invalid draft.');
    await setRaw(menu);
    await page.getByRole('button', { name: 'Startseite der Vorschau', exact: true }).first().click();

    await page.locator('.sim-native-tab').nth(1).click();
    await waitFor(() => websiteLoads.includes(website + '/news?tab=2'), 'Preview tab did not navigate.');
    const loadCount = websiteLoads.length;
    await rows.first().locator('[data-navigation-field="label"]').fill('Start');
    assert.equal(await currentUrl(), website + '/news?tab=2', 'Editing menu text must not return the preview Home.');
    assert.equal(websiteLoads.length, loadCount, 'Overlay edits must not reload the website.');
    await page.getByRole('button', { name: 'Aktuelles Vorschau-Ziel neu laden', exact: true }).click();
    await waitFor(() => websiteLoads.length > loadCount, 'Reload did not load the active preview route.');
    assert.equal(websiteLoads.at(-1), website + '/news?tab=2');
    await page.getByRole('button', { name: 'Vorheriges Vorschau-Ziel', exact: true }).click();
    assert.equal(await currentUrl(), website + '/app/index.html');
    await page.getByRole('button', { name: 'Nächstes Vorschau-Ziel', exact: true }).click();
    assert.equal(await currentUrl(), website + '/news?tab=2');
    assert.equal(page.url(), origin + '/', 'Preview controls must not navigate Builder itself.');

    await page.locator('#topBar').uncheck();
    const launcher = page.locator('.sim-native-launcher');
    assert.equal(await launcher.isVisible(), true);
    await launcher.click();
    assert.equal(await page.locator('.sim-native-drawer').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sim-native-drawer').isVisible(), false);
    assert.equal(await launcher.evaluate(node => node === document.activeElement), true);
    await launcher.click();
    await page.locator('.sim-native-item').last().click();
    assert.equal(await currentUrl(), website + '/settings');

    const maxMenu = Array.from({ length: 12 }, (_, i) => ({ label: `Page ${i + 1}`, url: `/page-${i + 1}` }));
    await setRaw(maxMenu);
    assert.equal(await rows.count(), 12);
    assert.equal(await page.getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.sim-native-tab').count(), 5);
    await setRaw([{ label: '<img src=x onerror=alert(1)>', url: '/safe' }]);
    assert.equal(await page.locator('#nativeNavigationEditor img, .sim-native-screen img').count(), 0);
    assert.equal(await page.locator('.sim-native-tab').textContent(), '<img src=x onerror=alert(1)>');
    await setRaw([{ label: 'Unsafe', url: 'https://example.test.evil.test/' }]);
    assert.equal(await rows.first().locator('[aria-invalid="true"]').count(), 1);
    await page.waitForFunction(() => document.getElementById('saveState').textContent === 'CHECK INPUT');

    await setRaw([{ label: 'Bad icon', url: '/', icon: 'https://evil.test/icon.svg' }]);
    assert.equal(await rows.first().locator('[data-navigation-field="icon"][aria-invalid="true"]').count(), 1);
    assert.equal(await rows.first().locator('img').count(), 0, 'Remote icon URLs must never become image requests.');
    await page.waitForFunction(() => document.getElementById('saveState').textContent === 'CHECK INPUT');
    await rows.first().locator('[data-navigation-field="icon"]').selectOption('info');
    assert.equal(JSON.parse(await sourceValue())[0].icon, 'info', 'Invalid raw icon data remains correctable in the visual editor.');

    await setRaw([]);
    assert.equal(await rows.count(), 0);
    assert.equal(await page.locator('.sim-native-tab').textContent(), 'Home');
    await setRaw(menu);
    await flush();
    await page.locator('#backToApps').click();
    await openApp(2);
    assert.equal(await rows.count(), 1);
    assert.equal(await page.locator('.sim-native-tab').textContent(), 'Second');
    assert.equal(await currentUrl(), website + '/app/index.html');
    assert.equal(await page.getByRole('button', { name: 'Vorheriges Vorschau-Ziel', exact: true }).isDisabled(), true);
    await page.locator('#backToApps').click();
    await openApp(1);
    assert.equal(await rows.count(), 6);
    assert.equal(JSON.parse(await sourceValue())[0].label, 'Home');

    // Hold file reads to exercise real asynchronous races without timing the
    // upload against a fast local image decoder.
    const holdFileRead = async () => page.evaluate(() => {
      window.originalReadAsDataURL = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function(file) { window.pendingNavigationRead = { reader: this, file }; };
    });
    const releaseFileRead = async () => {
      await page.evaluate(() => {
        FileReader.prototype.readAsDataURL = window.originalReadAsDataURL;
        const pending = window.pendingNavigationRead;
        window.originalReadAsDataURL.call(pending.reader, pending.file);
      });
      await page.waitForFunction(() => window.pendingNavigationRead.reader.readyState === FileReader.DONE);
      await page.waitForTimeout(150);
    };
    await holdFileRead();
    await rows.first().locator('[data-navigation-upload="icon"]').setInputFiles({ name: 'replaced.png', mimeType: 'image/png', buffer: customPng });
    await rows.first().locator('[data-navigation-field="icon"]').selectOption('camera');
    await releaseFileRead();
    assert.equal(JSON.parse(await sourceValue())[0].icon, 'camera', 'A newer selection must win over an earlier upload.');
    await setRaw(menu);
    await flush();

    await holdFileRead();
    await rows.first().locator('[data-navigation-upload="icon"]').setInputFiles({ name: 'late.png', mimeType: 'image/png', buffer: customPng });
    await page.locator('#backToApps').click();
    await openApp(2);
    const secondSource = await sourceValue();
    await releaseFileRead();
    assert.equal(await sourceValue(), secondSource, 'An upload from the old profile must not mutate the newly opened profile.');
    await page.locator('#backToApps').click();
    await openApp(1);

    // Build three group levels entirely through the visual controls, including
    // the parent selector used on phones. No advanced JSON is needed here.
    await setRaw([]);
    await oneChange(() => page.getByRole('button', { name: 'Gruppe hinzufügen', exact: true }).click(), 'Adding a group must emit one canonical change.');
    const serviceId = JSON.parse(await sourceValue())[0].id;
    assert.match(serviceId, /^[a-z][a-z0-9_-]{0,39}$/);
    assert.equal(JSON.parse(await sourceValue())[0].collapsed, false);
    assert.deepEqual(JSON.parse(await sourceValue())[0].children, []);
    assert.equal(await groupRow(serviceId).locator('[data-navigation-field="url"]').count(), 0, 'Groups must not offer a URL field.');
    await groupRow(serviceId).locator('[data-navigation-field="label"]').fill('Service');
    await groupRow(serviceId).locator('[data-navigation-field="icon"]').selectOption('folder');
    await groupRow(serviceId).locator('[data-navigation-field="active_icon"]').selectOption('star');
    await oneChange(() => groupRow(serviceId).locator('[data-navigation-field="collapsed"]').check(), 'Changing the initial collapsed state must emit one canonical change.');
    assert.equal(JSON.parse(await sourceValue())[0].collapsed, true);
    assert.equal(await groupToggle(serviceId).getAttribute('aria-expanded'), 'false');
    await oneChange(() => groupRow(serviceId).getByRole('button', { name: 'Untergruppe in Service hinzufügen', exact: true }).click(), 'Adding a subgroup must emit one canonical change.');
    const supportId = JSON.parse(await sourceValue())[0].children[0].id;
    await groupRow(supportId).locator('[data-navigation-field="label"]').fill('Support');
    await groupRow(supportId).getByRole('button', { name: 'Untergruppe in Support hinzufügen', exact: true }).click();
    const detailId = JSON.parse(await sourceValue())[0].children[0].children[0].id;
    await groupRow(detailId).locator('[data-navigation-field="label"]').fill('Details');
    assert.equal(await groupRow(detailId).getByRole('button', { name: 'Untergruppe in Details hinzufügen', exact: true }).isDisabled(), true, 'A fourth group level must not be creatable.');
    await oneChange(() => groupRow(detailId).getByRole('button', { name: 'Menüpunkt in Details hinzufügen', exact: true }).click(), 'Adding a nested link must emit one canonical change.');
    await rows.last().locator('[data-navigation-field="label"]').fill('Guide');
    await rows.last().locator('[data-navigation-field="url"]').fill('/guide');
    await rows.last().locator('[data-navigation-field="icon"]').selectOption('info');
    await rows.last().locator('[data-navigation-field="active_icon"]').selectOption('help');
    const guide = await rowNamed('Guide');
    assert.equal(await guide.getAttribute('data-navigation-depth'), '3');
    assert.equal(await guide.locator('.qb-nav-editor__trail').textContent(), 'Service / Support / Details');
    await page.getByRole('button', { name: 'Gruppe hinzufügen', exact: true }).click();
    const accountId = JSON.parse(await sourceValue())[1].id;
    assert.notEqual(accountId, serviceId);
    await groupRow(accountId).locator('[data-navigation-field="label"]').fill('Account');
    const accountKey = await groupRow(accountId).getAttribute('data-navigation-key');
    assert.deepEqual(await groupRow(serviceId).locator('[data-navigation-field="parent"] option').evaluateAll(nodes => nodes.map(node => node.value)), [''], 'A depth-three subtree must exclude its descendants and every parent that would exceed the limit.');
    const supportBeforeMove = JSON.parse(await sourceValue())[0].children[0];
    await oneChange(() => groupRow(supportId).locator('[data-navigation-field="parent"]').selectOption(accountKey), 'Moving a subtree must emit one canonical change.');
    assert.equal(JSON.parse(await sourceValue())[0].children.length, 0);
    assert.deepEqual(JSON.parse(await sourceValue())[1].children[0], supportBeforeMove, 'A parent move must preserve IDs, children and icons.');
    assert.equal(await guide.locator('.qb-nav-editor__trail').textContent(), 'Account / Support / Details');
    const guideBeforeMove = JSON.parse(await sourceValue())[1].children[0].children[0].children[0];
    await oneChange(() => guide.locator('[data-navigation-field="parent"]').selectOption(''), 'Moving a link to the main level must emit one canonical change.');
    assert.deepEqual(JSON.parse(await sourceValue()).at(-1), guideBeforeMove);
    const detailKey = await groupRow(detailId).getAttribute('data-navigation-key');
    await guide.locator('[data-navigation-field="parent"]').selectOption(detailKey);
    assert.equal(await guide.getAttribute('data-navigation-depth'), '3');
    const promotedChildren = JSON.parse(await sourceValue())[1].children[0].children;
    await oneChange(() => groupRow(supportId).getByRole('button', { name: 'Support auflösen und Einträge behalten', exact: true }).click(), 'Dissolving a group must emit one canonical change.');
    assert.deepEqual(JSON.parse(await sourceValue())[1].children, promotedChildren, 'Dissolving a nested group must promote every child in order.');
    await groupRow(accountId).getByRole('button', { name: 'Account auflösen und Einträge behalten', exact: true }).click();
    assert.deepEqual(JSON.parse(await sourceValue())[1], promotedChildren[0], 'Dissolving a top-level group keeps its entire remaining subtree.');
    assert.equal(await guide.getAttribute('data-navigation-depth'), '1');
    await flush();
    const savedGroups = structuredClone(saves.at(-1).config.navigation.items);
    const savesBeforeGroupHydration = saves.length;
    await page.locator('#backToApps').click();
    await openApp(2);
    await page.locator('#backToApps').click();
    await openApp(1);
    assert.deepEqual(JSON.parse(await sourceValue()), savedGroups, 'Saved groups must hydrate with their IDs, hierarchy, icons and collapsed defaults intact.');
    assert.equal(saves.length, savesBeforeGroupHydration, 'Hydrating grouped profiles must not save changes.');

    const grouped = [
      { label: 'Home', url: '/', icon: 'home' },
      { type: 'group', id: 'service', label: 'Service', collapsed: true, icon: 'folder', active_icon: 'star', children: [
        { label: 'News', url: '/news', icon: 'mail' },
        { type: 'group', id: 'support', label: 'Support', collapsed: true, icon: 'help', children: [
          { type: 'group', id: 'details', label: 'Details', collapsed: true, icon: 'info', children: [
            { label: 'Guide', url: '/guide', icon: 'info', active_icon: 'heart' },
            { label: 'Downloads', url: '/downloads', icon: 'download' },
          ] },
        ] },
        { label: 'Settings', url: '/settings', icon: 'settings' },
      ] },
      { type: 'group', id: 'account', label: 'Account', collapsed: true, icon: 'user', children: [
        { label: 'Profile', url: '/profile', icon: 'user' },
      ] },
      { label: 'Help', url: '/help', icon: 'help' },
    ];
    await setRaw(grouped);
    assert.equal(await rows.count(), 11);
    assert.equal(await page.locator('.sim-native-group-toggle').count(), 4);
    assert.deepEqual(await page.locator('.sim-native-tab').allTextContents(), ['Home', 'News', 'Guide', 'Downloads', 'Settings'], 'Tabs use the first five links depth-first without consuming places for group headings.');
    assert.deepEqual(await page.locator('.qb-nav-editor__badge.is-tab').allTextContents(), ['Tab-Platz 1', 'Tab-Platz 2', 'Tab-Platz 3', 'Tab-Platz 4', 'Tab-Platz 5']);
    for (const id of ['service', 'support', 'details', 'account']) assert.equal(await groupToggle(id).getAttribute('aria-expanded'), 'false');
    const beforeGroupNavigation = websiteLoads.length;
    await launcher.click();
    await groupToggle('service').click();
    assert.equal(await groupToggle('service').getAttribute('aria-expanded'), 'true');
    assert.equal(websiteLoads.length, beforeGroupNavigation, 'A group heading toggles its content without navigating the website.');
    assert.equal(await page.locator('.sim-native-drawer').isVisible(), true, 'Expanding a group keeps the drawer open.');
    await groupToggle('service').press('Enter');
    assert.equal(await groupToggle('service').getAttribute('aria-expanded'), 'false', 'A group toggle is operable with the keyboard.');
    await page.keyboard.press('Escape');
    await page.locator('.sim-native-tab').nth(2).click();
    assert.equal(await currentUrl(), website + '/guide');
    for (const id of ['service', 'support', 'details']) assert.equal(await groupToggle(id).getAttribute('aria-expanded'), 'true', 'Navigating to a nested route reveals every ancestor.');
    assert.equal(await groupToggle('service').locator('[data-icon="star"]').count(), 1, 'An active descendant selects the group active icon.');
    assert.equal(await groupToggle('service').getAttribute('aria-current'), null, 'A group heading is not a page link.');
    assert.equal(await groupToggle('account').getAttribute('aria-expanded'), 'false');
    await launcher.click();
    await groupToggle('service').click();
    await page.keyboard.press('Escape');
    const loadsBeforeRename = websiteLoads.length;
    await groupRow('service').locator('[data-navigation-field="label"]').fill('Services');
    assert.equal(await groupToggle('service').getAttribute('aria-expanded'), 'false', 'A cosmetic edit must preserve a manually collapsed active branch.');
    assert.equal(websiteLoads.length, loadsBeforeRename, 'Renaming a group must not reload the current route.');
    await page.locator('.sim-native-tab').nth(2).click();
    assert.equal(await groupToggle('service').getAttribute('aria-expanded'), 'false', 'A same-URL callback must preserve a manual collapse.');
    await page.locator('.sim-native-tab').first().click();
    await page.locator('.sim-native-tab').nth(2).click();
    assert.equal(await groupToggle('service').getAttribute('aria-expanded'), 'true', 'Returning from another route reveals the active branch again.');

    const nestedGuide = await rowNamed('Guide');
    const detailChildren = JSON.parse(await sourceValue())[1].children[1].children[0].children;
    await oneChange(() => nestedGuide.getByRole('button', { name: 'Guide nach unten verschieben', exact: true }).click(), 'Nested sibling sorting must emit one canonical change.');
    assert.deepEqual(JSON.parse(await sourceValue())[1].children[1].children[0].children, [detailChildren[1], detailChildren[0]], 'Sibling sorting must stay inside the same parent.');
    await nestedGuide.locator('.qb-nav-editor__handle').press('ArrowUp');
    assert.deepEqual(JSON.parse(await sourceValue())[1].children[1].children[0].children, detailChildren);
    const serviceBeforeDrag = JSON.parse(await sourceValue())[1];
    await oneChange(() => page.evaluate(() => {
      const source = document.querySelector('[data-navigation-group-id="service"]');
      const target = document.querySelector('[data-navigation-type="link"]');
      const transfer = new DataTransfer();
      source.querySelector('.qb-nav-editor__handle').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: target.getBoundingClientRect().top, dataTransfer: transfer }));
    }), 'Dragging a group must emit one canonical change.');
    assert.deepEqual(JSON.parse(await sourceValue())[0], serviceBeforeDrag, 'Dragging a group must move its whole subtree without changing it.');
    await groupRow('service').getByRole('button', { name: 'Services nach unten verschieben', exact: true }).click();

    // An in-flight child upload follows the surviving child when its parent is
    // dissolved. An upload owned by the removed group must be discarded.
    await setRaw([{ type: 'group', id: 'upload-group', label: 'Upload group', children: [{ label: 'Upload child', url: '/upload-child', icon: 'info' }] }]);
    await holdFileRead();
    await rows.last().locator('[data-navigation-upload="icon"]').setInputFiles({ name: 'nested.png', mimeType: 'image/png', buffer: customPng });
    await groupRow('upload-group').getByRole('button', { name: 'Upload group auflösen und Einträge behalten', exact: true }).click();
    await releaseFileRead();
    assert.equal(JSON.parse(await sourceValue())[0].icon, customIcon, `A child upload remains attached to the child after unwrapping its parent. Current tree: ${await sourceValue()}`);
    await setRaw([{ type: 'group', id: 'removed-upload', label: 'Removed upload', children: [{ label: 'Kept child', url: '/kept' }] }]);
    await holdFileRead();
    await groupRow('removed-upload').locator('[data-navigation-upload="icon"]').setInputFiles({ name: 'removed.png', mimeType: 'image/png', buffer: customPng });
    await groupRow('removed-upload').getByRole('button', { name: 'Removed upload auflösen und Einträge behalten', exact: true }).click();
    const unwrappedSource = await sourceValue();
    await releaseFileRead();
    assert.equal(await sourceValue(), unwrappedSource, 'An upload on a removed group must not alter the promoted children.');

    await setRaw([{ type: 'group', id: 'duplicate', label: 'First', children: [] }, { type: 'group', id: 'duplicate', label: 'Second', children: [] }]);
    assert.equal(await page.locator('.qb-nav-editor__row.has-error').count(), 2, 'Duplicate group IDs must remain visible with row errors.');
    await page.waitForFunction(() => document.getElementById('saveState').textContent === 'CHECK INPUT');
    await setRaw([{ type: 'group', id: 'unsafe-nested', label: 'Unsafe group', children: [{ label: 'Unsafe child', url: 'https://evil.test/' }] }]);
    assert.equal(await rows.last().locator('[data-navigation-field="url"][aria-invalid="true"]').count(), 1, 'Nested destination errors must be attached to the affected child.');
    await rows.last().locator('[data-navigation-field="url"]').fill('/safe-child');
    assert.equal(await rows.last().locator('.qb-nav-editor__row-error').isVisible(), false);
    const invalidGroups = JSON.stringify([{ type: 'group', id: 'bad-children', label: 'Broken', children: {} }]);
    await setRaw(invalidGroups);
    assert.equal(await sourceValue(), invalidGroups, 'Malformed group JSON must remain untouched.');
    assert.equal(await page.getByRole('button', { name: 'Gruppe hinzufügen', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).isDisabled(), true);

    const fullTree = [...maxMenu, ...Array.from({ length: 12 }, (_, index) => ({ type: 'group', id: `empty-${index + 1}`, label: `Group ${index + 1}`, children: [] }))];
    await setRaw(fullTree);
    assert.equal(await rows.count(), 24, 'Link and group limits are counted independently across the entire tree.');
    assert.equal(await page.getByRole('button', { name: 'Gruppe hinzufügen', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).isDisabled(), true);
    await flush();
    assert.equal(saves.at(-1).config.navigation.items.length, 24, 'A valid 24-node profile must save successfully.');
    await page.locator('#nativeNavigationJson').evaluate(node => { node.open = false; });
    for (const width of [1440, 390, 360]) await checkEditorLayout(width, 'The 24-node editor');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setRaw([{ type: 'group', id: 'empty-menu', label: 'Empty menu', collapsed: true, children: [] }]);
    assert.equal(await page.locator('.sim-native-tab').textContent(), 'Home');
    assert.equal(await page.locator('.sim-native-item:not(.sim-native-group-toggle)').count(), 1, 'Empty groups still get the Home fallback link.');
    assert.equal(await groupToggle('empty-menu').count(), 1, 'Empty group headings remain in the sidebar.');
    await checkGroupEdgeCases();

    const illustrated = menu.map((item, index) => ({ ...item, icon: ['home', 'mail', 'folder', 'user', 'help', 'settings'][index], active_icon: index === 0 ? 'star' : undefined }));
    await setRaw(illustrated);
    await page.locator('#nativeNavigationJson').evaluate(node => { node.open = false; });
    const screenshotDir = process.env.QB_SCREENSHOT_DIR;
    for (const width of [1440, 390, 360]) {
      await checkEditorLayout(width, 'The flat menu editor');
      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await rows.first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `navigation-${width}.png`), animations: 'disabled' });
        await page.locator('.simulator-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `preview-${width}.png`), animations: 'disabled' });
      }
    }
    await setRaw(grouped);
    await page.locator('#nativeNavigationJson').evaluate(node => { node.open = false; });
    await page.locator('.sim-native-tab').nth(2).click();
    for (const width of [1440, 390, 360]) {
      await checkEditorLayout(width, 'The three-level group editor');
      if (screenshotDir) {
        await groupRow('service').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `groups-${width}.png`), animations: 'disabled' });
        await page.locator('.qb-nav-editor__row[data-navigation-depth="3"]').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `group-child-${width}.png`), animations: 'disabled' });
        await page.locator('.simulator-panel').scrollIntoViewIfNeeded();
        await launcher.click();
        await page.screenshot({ path: path.join(screenshotDir, `group-preview-${width}.png`), animations: 'disabled' });
        await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(errors, [], 'The integrated app must not throw browser errors.');
    console.log('PASS: profile hydration, autosave, built-in/active/custom icons, exact dirty events, PNG rejection, upload selection/profile/group races, nested group creation, mobile parent moves, subtree drag and sibling order, lossless group unwrapping, depth and node limits, invalid nested JSON, flattened tabs, collapse and active ancestors, trusted destinations, XSS text, live overlays, route history, drawer, profile switching, 1440/390/360px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
