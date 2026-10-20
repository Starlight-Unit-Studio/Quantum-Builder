'use strict';

// Actual frontend with isolated API/website fixtures. No external site or build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const origin = 'http://quantum-builder.test';
const website = 'https://app.example.test';
const baseItems = [ { label: 'Home', url: '/' }, { label: 'News', url: '/news' }, { label: 'Library', url: '/library' }, { label: 'Help', url: '/help' } ];
const makeApp = id => ({
  id, uuid: `qa-menu-${id}-00000000`, name: `Menu QA ${id}`, start_url: website + '/app/index.html',
  package_id: `test.quantum.menus${id}`, description: '', version_name: '0.1.0', version_code: 4, min_sdk: 23, target_sdk: 36,
  config: { trusted_domain: 'example.test', navigation: {
    top_bar: true, sidebar: true, bottom_tabs: true, contextual_toolbar: true, title: 'Menu QA',
    background: '#102030', foreground: '#ffffff', accent: '#6fc7ff', items: structuredClone(baseItems),
  } },
});
const apps = [makeApp(1), makeApp(2)];
const saves = [];
const loads = [];
const errors = [];
let builds = 0;
let html = fs.readFileSync(path.join(root, 'public/index.php'), 'utf8')
  .replace(/^<\?php[\s\S]*?\?>\s*/, '')
  .replaceAll("<?= $authenticated ? ' is-hidden' : '' ?>", ' is-hidden')
  .replaceAll("<?= $authenticated ? '' : ' is-hidden' ?>", '')
  .replace(/<\?= htmlspecialchars\(Config::version\(\), ENT_QUOTES\) \?>/g, version)
  .replace(/<\?= json_encode\([\s\S]*?\?>/, JSON.stringify({ authenticated: true, csrf: 'qa-token', version }));
assert.ok(!html.includes('<?'));
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
const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(1, 0); pngHeader.writeUInt32BE(1, 4); pngHeader[8] = 8; pngHeader[9] = 6;
const customPng = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', pngHeader), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 255, 255, 255]))), chunk('IEND', Buffer.alloc(0))]);
const customIcon = 'data:image/png;base64,' + customPng.toString('base64');
const waitFor = async (check, message) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true,
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
        loads.push(url.href);
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Isolated menu preview</body></html>' });
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
          saves.push(structuredClone(payload));
          const app = apps.find(app => app.id === payload.id);
          Object.assign(app, payload);
          result.app = app;
        } else if (action === 'queue_build') { builds += 1; result = { ok: false, message: 'Build disabled in test.' }; }
        else if (action !== 'logout') throw new Error(`Unexpected fixture action: ${action}`);
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
    const selector = page.locator('#nativeNavigationMenuSelect');
    const raw = page.locator('#nativeNavigationProfile');
    const value = async () => JSON.parse(await raw.inputValue());
    const menuEditor = id => page.locator(`[data-navigation-menu-editor="${id}"]`);
    const menuRaw = id => page.locator(`[data-navigation-menu-json="${id}"]`);
    const rule = index => page.locator(`[data-navigation-rule-index="${index}"]`);
    const ruleField = (index, field) => rule(index).locator(`[data-navigation-rule-field="${field}"]`);
    const currentUrl = () => page.locator('#simulatorFrame').getAttribute('data-preview-url');
    const sidebarId = () => page.locator('.sim-native-drawer-items').getAttribute('data-menu-id');
    const tabsId = () => page.locator('.sim-native-tabs').getAttribute('data-menu-id');
    const setProfile = async source => {
      await page.locator('#nativeNavigationProfileJson').evaluate(node => { node.open = true; });
      await raw.fill(typeof source === 'string' ? source : JSON.stringify(source));
    };
    const flush = async () => {
      const before = saves.length;
      await page.locator('#saveAppButton').click();
      await waitFor(() => saves.length > before, 'Profile did not save.');
    };
    const oneChange = async (action, description) => {
      const before = await page.evaluate(() => window.menuEvents);
      await action();
      assert.equal(await page.evaluate(() => window.menuEvents), before + 1, description);
    };
    const addDestination = async (id, label, url) => {
      await menuEditor(id).getByRole('button', { name: 'Menüpunkt hinzufügen', exact: true }).click();
      const row = menuEditor(id).locator('.qb-nav-editor__row').last();
      await row.locator('[data-navigation-field="label"]').fill(label);
      await row.locator('[data-navigation-field="url"]').fill(url);
    };
    const layout = async width => {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.locator('[data-editor-section="navigation"]').evaluate(node => {
        const targets = [...node.querySelectorAll('.qb-nav-menus,.qb-nav-rule,.qb-nav-editor,.qb-nav-menu-panel')].filter(node => node.getClientRects().length);
        const controls = [...node.querySelectorAll('button,select,input:not([type="checkbox"]):not([type="file"]),summary')].filter(node => node.getClientRects().length);
        return { overflow: targets.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className),
          short: controls.filter(node => node.getBoundingClientRect().height < 43).map(node => node.id || node.className),
          left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right };
      });
      assert.deepEqual(geometry.overflow, [], `${width}px horizontal overflow`);
      assert.deepEqual(geometry.short, [], `${width}px controls below 44px`);
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1, `${width}px panel outside viewport`);
      if (process.env.QB_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.QB_SCREENSHOT_DIR, { recursive: true });
        await page.locator('#nativeNavigationMenusEditor').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.QB_SCREENSHOT_DIR, `menus-editor-${width}.png`) });
        await rule(0).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.QB_SCREENSHOT_DIR, `menus-rule-${width}.png`) });
      }
    };

    await page.goto(origin);
    await page.locator('[data-open-app="1"]').click();
    await page.locator('[data-section="navigation"]').click();
    await selector.waitFor();
    assert.equal(await selector.inputValue(), 'default');
    assert.equal(await sidebarId(), 'default');
    assert.equal(await tabsId(), 'default');
    await page.evaluate(() => {
      window.menuEvents = 0;
      document.getElementById('nativeNavigationProfile').addEventListener('input', () => { window.menuEvents += 1; });
    });

    await oneChange(() => page.locator('#nativeNavigationAddMenu').click(), 'Adding a menu emits one canonical change.');
    const shopId = await selector.inputValue();
    await oneChange(() => page.locator('#nativeNavigationMenuLabel').fill('Shop'), 'Renaming emits one canonical change.');
    assert.equal((await value()).menus[0].id, shopId, 'Menu names must not change stable IDs.');
    await addDestination(shopId, 'Shopübersicht', '/shop');
    await addDestination(shopId, 'Warenkorb', '/checkout');
    await page.locator('#nativeSidebarMenu').selectOption(shopId);
    assert.equal(await sidebarId(), shopId);
    assert.equal(await tabsId(), 'default');
    assert.equal(await page.locator('.sim-native-tab').count(), 4);
    assert.equal(await page.locator('.sim-native-drawer-items .sim-native-item').count(), 2);
    const beforeSwitchUrl = await currentUrl();
    const beforeSwitchLoads = loads.length;
    await selector.selectOption('default');
    await selector.selectOption(shopId);
    assert.equal(await menuEditor(shopId).locator('.qb-nav-editor__row').count(), 2);
    assert.equal(await currentUrl(), beforeSwitchUrl);
    assert.equal(loads.length, beforeSwitchLoads, 'Editing menu selection must not reload the website.');

    await page.locator('#nativeNavigationAddMenu').click();
    const accountId = await selector.inputValue();
    await page.locator('#nativeNavigationMenuLabel').fill('Konto');
    await page.locator('#nativeBottomTabsMenu').selectOption(accountId);
    assert.equal(await tabsId(), accountId);
    assert.deepEqual(await page.locator('.sim-native-tab').allTextContents(), ['Home']);
    assert.equal(await page.locator('.sim-native-drawer-items .sim-native-item').count(), 2, 'Empty tab menu does not change Sidebar.');
    await page.locator('#nativeBottomTabsMenu').selectOption('default');

    await oneChange(() => page.locator('#nativeNavigationAddRule').click(), 'Adding a rule emits one canonical change.');
    await ruleField(0, 'path').fill('/shop');
    await ruleField(0, 'sidebar_menu').selectOption(accountId);
    await ruleField(0, 'bottom_tabs_menu').selectOption(shopId);
    await ruleField(0, 'visibility.top_bar').selectOption('false');
    await ruleField(0, 'visibility.contextual_toolbar').selectOption('false');
    await page.getByRole('button', { name: 'Seitenmenü der Vorschau öffnen', exact: true }).click();
    await page.locator('.sim-native-drawer-items').getByRole('button', { name: 'Shopübersicht', exact: true }).click();
    assert.equal(await currentUrl(), website + '/shop');
    assert.equal(await sidebarId(), accountId);
    assert.equal(await tabsId(), shopId);
    assert.equal(await page.locator('.sim-native-top').isVisible(), false);
    assert.equal(await page.locator('.sim-native-toolbar').isVisible(), false);
    assert.equal(await page.locator('.sim-native-launcher').isVisible(), true, 'Sidebar remains reachable without Top Bar.');
    assert.equal(await page.locator('.sim-native-screen').getAttribute('data-matched-rule'), '0');
    const insets = await page.locator('.sim-native-screen').evaluate(node => ({ top: node.style.getPropertyValue('--sim-nav-top-height'), tabs: node.style.getPropertyValue('--sim-nav-tabs-height'), context: node.style.getPropertyValue('--sim-nav-context-height') }));
    assert.deepEqual(insets, { top: '0px', tabs: '58px', context: '0px' });

    await page.locator('#nativeNavigationAddRule').click();
    await ruleField(1, 'sidebar_menu').selectOption('default');
    await ruleField(1, 'visibility.top_bar').selectOption('true');
    assert.equal(await sidebarId(), accountId, 'Later matching rules do not override the first rule.');
    const beforeReorderLoads = loads.length;
    const beforeReorderUrl = await currentUrl();
    await oneChange(() => rule(1).locator('[data-navigation-rule-action="up"]').click(), 'Rule reorder emits one canonical change.');
    assert.equal(await sidebarId(), 'default');
    assert.equal(await tabsId(), 'default');
    assert.equal(await page.locator('.sim-native-top').isVisible(), true);
    assert.equal(await currentUrl(), beforeReorderUrl);
    assert.equal(loads.length, beforeReorderLoads, 'Changing rules recalculates navigation without website reload.');
    await rule(0).locator('[data-navigation-rule-action="remove"]').click();
    assert.equal(await sidebarId(), accountId);
    await ruleField(0, 'host').fill('other.example.test');
    assert.equal(await sidebarId(), shopId, 'An exact host filter excludes another trusted host.');
    await ruleField(0, 'host').fill('APP.EXAMPLE.TEST');
    assert.equal(await sidebarId(), accountId);
    await ruleField(0, 'host').fill('');
    await page.locator('.sim-native-tab').filter({ hasText: 'Warenkorb' }).click();
    assert.equal(await currentUrl(), website + '/checkout');
    assert.equal(await sidebarId(), shopId);
    assert.equal(await tabsId(), 'default');
    assert.equal(await page.locator('.sim-native-top').isVisible(), true);

    // Showing a normally hidden area must work without toggling its default.
    await page.locator('#topBar').uncheck();
    await ruleField(0, 'path').fill('/checkout');
    await ruleField(0, 'visibility.top_bar').selectOption('true');
    assert.equal(await page.locator('#topBar').isChecked(), false);
    assert.equal(await page.locator('.sim-native-top').isVisible(), true);
    await page.locator('#topBar').check();

    // A JSON draft stays attached to its menu and blocks both saves and builds.
    await selector.selectOption(accountId);
    await addDestination(accountId, 'Profil', '/account');
    const accountGood = await menuRaw(accountId).inputValue();
    await menuRaw(accountId).evaluate(node => { node.closest('details').open = true; });
    await menuRaw(accountId).fill('[{"label":');
    await selector.selectOption('default');
    const invalidSaveCount = saves.length;
    await page.locator('#saveAppButton').click();
    await page.locator('[data-section="build"]').click();
    await page.locator('#rebuildAllButton').click();
    await page.locator('[data-section="navigation"]').click();
    assert.equal(saves.length, invalidSaveCount, 'An invalid inactive menu must block save.');
    assert.equal(builds, 0, 'An invalid inactive menu must block build.');
    assert.equal(await page.locator('#nativeNavigationMenusError').isVisible(), true);
    await selector.selectOption(accountId);
    assert.equal(await menuRaw(accountId).inputValue(), '[{"label":');
    await menuRaw(accountId).fill(accountGood);
    assert.equal(await page.locator('#nativeNavigationMenusError').isVisible(), false);

    // An in-flight upload survives switching to a different menu.
    await page.evaluate(() => {
      window.originalMenuReader = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function(file) { window.pendingMenuRead = { reader: this, file }; };
    });
    await menuEditor(accountId).locator('[data-navigation-upload="icon"]').first().setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: customPng });
    await raw.dispatchEvent('change');
    await selector.selectOption(shopId);
    await page.evaluate(() => {
      FileReader.prototype.readAsDataURL = window.originalMenuReader;
      window.originalMenuReader.call(window.pendingMenuRead.reader, window.pendingMenuRead.file);
    });
    await page.waitForFunction(id => JSON.parse(document.getElementById('nativeNavigationProfile').value).menus.find(menu => menu.id === id).items[0].icon?.startsWith('data:'), accountId);
    assert.equal((await value()).menus.find(menu => menu.id === accountId).items[0].icon, customIcon);
    assert.equal((await value()).menus.find(menu => menu.id === shopId).items[0].icon, undefined);

    // References prevent deletion until the user reassigns them.
    const usedBefore = (await value()).menus.length;
    await page.locator('#nativeNavigationDeleteMenu').click();
    assert.equal((await value()).menus.length, usedBefore);
    assert.match(await page.locator('#nativeNavigationMenuDeleteHelp').textContent(), /kann noch nicht entfernt/);
    await waitFor(() => saves.some(saved => saved.config.navigation.menus?.find(menu => menu.id === accountId)?.items[0]?.icon === customIcon), 'Menu edits and uploads must autosave without a manual save.');
    await flush();
    const persisted = saves.at(-1).config.navigation;
    assert.equal(persisted.menus.length, 2);
    assert.equal(persisted.rules[0].bottom_tabs_menu, shopId);
    assert.equal(persisted.menus.find(menu => menu.id === accountId).items[0].icon, customIcon);

    // Invalid extension JSON retains the previous preview and keeps its exact source.
    const validSource = await raw.inputValue();
    const previousTabs = await tabsId();
    await setProfile('{"menus":');
    assert.equal(await raw.inputValue(), '{"menus":');
    assert.equal(await tabsId(), previousTabs);
    assert.equal(await page.locator('#nativeNavigationAddMenu').isDisabled(), true);
    await setProfile(validSource);
    await selector.selectOption(shopId);
    await page.locator('#nativeSidebarMenu').selectOption('default');
    await ruleField(0, 'bottom_tabs_menu').selectOption('');
    await page.locator('#nativeNavigationDeleteMenu').click();
    assert.equal((await value()).menus.length, 1, 'An unreferenced menu can be removed.');
    assert.equal(await selector.inputValue(), 'default');

    // Raw container failures and aggregate budget remain invalid, not silently repaired.
    const good = await value();
    for (const broken of [ { ...good, menus: {} }, { ...good, rules: {} }, { ...good, rules: [{ match: 'prefix', path: '/checkout', visibility: { top_bar: 'false' } }] } ]) {
      await setProfile(broken);
      assert.equal(await page.locator('#nativeNavigationMenusError').isVisible(), true);
      const before = saves.length;
      await page.locator('#saveAppButton').click();
      assert.equal(saves.length, before);
    }
    await setProfile({ menus: [1, 2].map(n => ({ id: 'full-' + n, label: 'Full ' + n, items: Array.from({ length: 12 }, (_, i) => ({ label: 'Item ' + i, url: '/item-' + i })) })) });
    assert.equal(await page.locator('#nativeNavigationMenusError').isVisible(), true, '24 additional nodes plus Standard exceeds total budget.');
    await setProfile(good);
    await selector.selectOption(accountId);
    for (const width of [1440, 390, 360]) await layout(width);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await flush();
    await page.evaluate(() => {
      window.originalMenuReader = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function(file) { window.pendingMenuRead = { reader: this, file }; };
    });
    await menuEditor(accountId).locator('[data-navigation-upload="active_icon"]').first().setInputFiles({ name: 'old-profile.png', mimeType: 'image/png', buffer: customPng });
    apps[1].config.navigation.menus = {};
    await page.locator('#backToApps').click();
    await page.locator('[data-open-app="2"]').click();
    await page.locator('[data-section="navigation"]').click();
    assert.equal(await selector.inputValue(), 'default');
    assert.equal(await selector.locator('option').count(), 1, 'A malformed new app must not retain the old menu catalogue.');
    assert.equal(await page.locator('[data-navigation-menu-editor]').count(), 0);
    assert.equal(await page.locator('#nativeNavigationAddMenu').isDisabled(), true);
    const badNewProfile = await raw.inputValue();
    await page.evaluate(() => {
      FileReader.prototype.readAsDataURL = window.originalMenuReader;
      window.originalMenuReader.call(window.pendingMenuRead.reader, window.pendingMenuRead.file);
    });
    await page.waitForFunction(() => window.pendingMenuRead.reader.readyState === FileReader.DONE);
    await page.waitForTimeout(80);
    assert.equal(await raw.inputValue(), badNewProfile, 'An old profile upload must not mutate a malformed new profile.');
    await setProfile({ menus: [], rules: [] });
    assert.equal((await value()).menus.length, 0, 'Profile switch must remove previous menu instances and rules.');
    assert.equal(await page.locator('.qb-nav-rule').count(), 0);
    assert.equal(await sidebarId(), 'default');
    assert.equal(await tabsId(), 'default');
    assert.deepEqual(errors, []);
    console.log('PASS: independent menu create/name/edit/default assignments, empty fallback, stable IDs, canonical changes, menu/rule autosave, URL-driven selection and visibility/insets, exact host filters, first-match/reorder, no rule-induced website reload, hidden-default overrides, invalid inactive drafts, save/build blocking, upload across menu switch, reference-safe delete, raw JSON preservation, total-node budget, profile reset, 1440/390/360px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
