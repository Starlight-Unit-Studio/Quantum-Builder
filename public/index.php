<?php

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use QuantumBuilder\Config;

header('Cache-Control: no-store');
$authenticated = $auth->isLoggedIn();
?>
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#020611">
  <title>Starlight Quantum Builder</title>
  <link rel="stylesheet" href="/assets/terran.css?v=<?= htmlspecialchars(Config::version(), ENT_QUOTES) ?>">
</head>
<body>
  <div class="qb-bg"></div>
  <div class="qb-veil"></div>

  <section id="loginScreen" class="login-screen<?= $authenticated ? ' is-hidden' : '' ?>">
    <form id="loginForm" class="terran-panel login-panel" autocomplete="on">
      <div class="kicker">TERRAN SYSTEMS · QUANTUM</div>
      <h1>QUANTUM BUILDER</h1>
      <p class="muted">Web-to-native App Provisioning Terminal</p>
      <label class="field-label" for="loginEmail">E-Mail</label>
      <input class="field" id="loginEmail" name="email" type="email" autocomplete="username" required>
      <label class="field-label" for="loginPassword">Passwort</label>
      <input class="field" id="loginPassword" name="password" type="password" autocomplete="current-password" required>
      <button class="btn primary full" type="submit">Terminal entsperren</button>
      <div id="loginError" class="status bad" role="alert"></div>
      <div class="version-chip">v<?= htmlspecialchars(Config::version(), ENT_QUOTES) ?></div>
    </form>
  </section>

  <div id="builderShell" class="builder-shell<?= $authenticated ? '' : ' is-hidden' ?>">
    <header class="topbar">
      <div class="brand-block">
        <button id="mobileNavToggle" class="icon-btn" type="button" aria-label="Navigation">☰</button>
        <div>
          <div class="kicker">TERRAN DEPLOYMENT INTERFACE</div>
          <div class="brand-title">STΛRLIGHT QUANTUM BUILDER</div>
        </div>
      </div>
      <div class="top-actions">
        <span id="systemStatus" class="chip ok-dot">SYSTEM ONLINE</span>
        <span class="chip">v<?= htmlspecialchars(Config::version(), ENT_QUOTES) ?></span>
        <button id="logoutButton" class="btn compact" type="button">Logout</button>
      </div>
    </header>

    <div class="workspace">
      <aside id="sidebar" class="sidebar">
        <button class="nav-item is-active" data-global-view="apps">01 · APPS</button>
        <button class="nav-item" data-global-view="members" disabled>02 · MEMBERS <small>planned</small></button>
        <button class="nav-item" data-global-view="testers" disabled>03 · TEST DEVICES <small>planned</small></button>
        <button class="nav-item" data-global-view="system" disabled>04 · SYSTEM <small>planned</small></button>
        <div class="sidebar-separator"></div>
        <div id="appNav" class="app-nav is-hidden">
          <div class="sidebar-label">APP PROFILE</div>
          <button class="nav-item is-active" data-section="overview">OVERVIEW</button>
          <button class="nav-item" data-section="branding">BRANDING</button>
          <button class="nav-item" data-section="interface">INTERFACE</button>
          <button class="nav-item" data-section="navigation">NATIVE NAVIGATION</button>
          <button class="nav-item" data-section="links">LINK HANDLING</button>
          <button class="nav-item" data-section="permissions">PERMISSIONS</button>
          <button class="nav-item" data-section="web">WEB OVERRIDES</button>
          <button class="nav-item" data-section="plugins">NATIVE PLUGINS</button>
          <button class="nav-item" data-section="build">BUILD & DEPLOY</button>
        </div>
      </aside>

      <main class="main-stage">
        <section id="appsView" class="view">
          <div class="section-head">
            <div>
              <div class="kicker">QUANTUM::APP_PROFILES</div>
              <h2>APPS</h2>
              <p class="muted">Ein Profil erzeugt bei jedem Build APK, AAB, Source ZIP und SHA256SUMS.</p>
            </div>
            <button id="newAppButton" class="btn primary" type="button">+ Neue App</button>
          </div>
          <div id="appsGrid" class="apps-grid"></div>
          <div id="emptyApps" class="terran-panel empty-state is-hidden">
            <div class="kicker">NO PROFILE DETECTED</div>
            <h3>Erstes App-Profil anlegen</h3>
            <p class="muted">Start-URL, Paket-ID und Buildprofil reichen für den ersten Quantum-Build.</p>
          </div>
        </section>

        <section id="editorView" class="view is-hidden">
          <div class="editor-header">
            <button id="backToApps" class="icon-btn" type="button" aria-label="Zurück">←</button>
            <div>
              <div id="editorKicker" class="kicker">APP::PROFILE</div>
              <h2 id="editorTitle">APP</h2>
            </div>
            <div class="editor-actions">
              <span id="saveState" class="chip">READY</span>
              <button id="saveAppButton" class="btn primary" type="button">Speichern</button>
            </div>
          </div>

          <div class="editor-layout">
            <form id="appForm" class="editor-form" autocomplete="off">
              <input id="appId" type="hidden">

              <section class="terran-panel editor-section" data-editor-section="overview">
                <div class="kicker">APP::OVERVIEW</div>
                <h3>Overview</h3>
                <div class="field-grid">
                  <label><span class="field-label">App Name</span><input class="field" id="appName" required maxlength="80"></label>
                  <label><span class="field-label">Website URL</span><input class="field mono" id="startUrl" type="url" required></label>
                  <label class="span-2"><span class="field-label">Beschreibung</span><textarea class="field" id="description" rows="4"></textarea></label>
                  <label><span class="field-label">Trusted Domain</span><input class="field mono" id="trustedDomain"></label>
                  <label><span class="field-label">Wrapper Ref</span><input class="field mono" id="wrapperRef"></label>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="branding">
                <div class="kicker">APP::BRANDING</div><h3>Branding</h3>
                <div class="field-grid">
                  <label><span class="field-label">Primary Color</span><input class="field color-field" id="primaryColor" type="color"></label>
                  <label><span class="field-label">Accent / Status</span><input class="field color-field" id="accentColor" type="color"></label>
                  <label><span class="field-label">Status Bar</span><input class="field color-field" id="statusBarColor" type="color"></label>
                  <label><span class="field-label">Navigation Bar</span><input class="field color-field" id="navigationBarColor" type="color"></label>
                  <label><span class="field-label">Splash Background</span><input class="field color-field" id="splashBackground" type="color"></label>
                  <div class="notice span-2">Icon- und Splash-Datei-Uploads folgen als eigenes Asset-Modul. Die Farb- und Runtime-Werte werden bereits im Profil gespeichert.</div>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="interface">
                <div class="kicker">APP::INTERFACE</div><h3>Interface</h3>
                <div class="field-grid">
                  <label><span class="field-label">Dark Mode</span><select class="field" id="darkMode"><option value="auto">Auto</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
                  <label><span class="field-label">Orientation</span><select class="field" id="orientation"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                  <label class="toggle"><input id="keepScreenOn" type="checkbox"><span>Keep Screen On</span></label>
                  <label class="toggle"><input id="fullscreen" type="checkbox"><span>Immersive Fullscreen</span></label>
                  <label class="toggle"><input id="pageTransitions" type="checkbox"><span>Native Page Transitions</span></label>
                  <label class="toggle"><input id="pullToRefresh" type="checkbox"><span>Pull-to-Refresh</span></label>
                  <label class="toggle"><input id="pinchToZoom" type="checkbox"><span>Pinch-to-Zoom</span></label>
                  <label><span class="field-label">Font Scale %</span><input class="field" id="fontScale" type="number" min="50" max="200" step="5"></label>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="navigation">
                <div class="kicker">APP::NATIVE_NAVIGATION</div><h3>Native Navigation</h3>
                <div class="field-grid">
                  <label class="toggle"><input id="topBar" type="checkbox"><span>Top Navigation Bar</span></label>
                  <label class="toggle"><input id="sidebarNav" type="checkbox"><span>Sidebar Navigation</span></label>
                  <label class="toggle"><input id="bottomTabs" type="checkbox"><span>Bottom Tab Bar</span></label>
                  <label class="toggle"><input id="contextualToolbar" type="checkbox"><span>Contextual Toolbar</span></label>
                  <div class="notice span-2">Visual Editors für Menüeinträge, Icons, Sichtbarkeitsregeln und Light/Dark-Styling sind für die nächste Ausbaustufe vorgesehen.</div>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="links">
                <div class="kicker">APP::LINK_HANDLING</div><h3>Link Handling</h3>
                <div class="field-grid">
                  <label><span class="field-label">New Windows</span><select class="field" id="newWindows"><option value="blocked">Blocked</option><option value="internal">Internal</option><option value="external">External</option></select></label>
                  <label><span class="field-label">Deep Link Scheme</span><input class="field mono" id="deepLinkScheme" placeholder="stu"></label>
                  <div class="notice span-2">Die vollständige regelbasierte Link-Engine wird als geordnete Rule-Liste umgesetzt. Das Datenmodell ist dafür bereits getrennt vom WebView-Core.</div>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="permissions">
                <div class="kicker">APP::PERMISSIONS</div><h3>Permissions</h3>
                <div class="field-grid">
                  <label class="toggle"><input id="permLocation" type="checkbox"><span>Location</span></label>
                  <label class="toggle"><input id="permMicrophone" type="checkbox"><span>Microphone / WebRTC Audio</span></label>
                  <label class="toggle"><input id="permCamera" type="checkbox"><span>Camera / WebRTC Video</span></label>
                  <label class="toggle"><input id="publicDownloads" type="checkbox"><span>Public Downloads</span></label>
                  <label class="toggle"><input id="backgroundAudio" type="checkbox"><span>Background Audio</span></label>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="web">
                <div class="kicker">APP::WEB_OVERRIDES</div><h3>Web Overrides</h3>
                <div class="field-grid">
                  <label class="span-2"><span class="field-label">User Agent Suffix</span><input class="field mono" id="userAgentSuffix"></label>
                  <label class="span-2"><span class="field-label">Custom Headers (JSON)</span><textarea class="field mono" id="customHeaders" rows="5" placeholder='{"X-Starlight-App":"my-app"}'></textarea></label>
                  <label class="span-2"><span class="field-label">Custom CSS</span><textarea class="field mono" id="customCss" rows="7"></textarea></label>
                  <label class="span-2"><span class="field-label">Custom JavaScript</span><textarea class="field mono" id="customJs" rows="7"></textarea></label>
                  <label><span class="field-label">Cookie Persistence</span><select class="field" id="cookiePersistence"><option value="default">Default</option><option value="persistent">Persistent</option><option value="session">Session only</option></select></label>
                </div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="plugins">
                <div class="kicker">APP::NATIVE_PLUGINS</div><h3>Native Plugins</h3>
                <div class="plugin-grid">
                  <label class="plugin-card"><input id="pluginNmp" type="checkbox"><strong>Quantum NMP</strong><span>Persistenter Native Media Player</span></label>
                  <label class="plugin-card"><input id="pluginAssetStore" type="checkbox"><strong>Quantum Asset Store</strong><span>Persistente statische Web-Assets</span></label>
                  <label class="plugin-card"><input id="pluginShare" type="checkbox"><strong>Share</strong><span>Android Sharesheet</span></label>
                  <label class="plugin-card"><input id="pluginHaptics" type="checkbox"><strong>Haptics</strong><span>Native Vibration/Haptic Bridge</span></label>
                  <label class="plugin-card"><input id="pluginBiometrics" type="checkbox"><strong>Biometrics</strong><span>BiometricPrompt / Passkey-Hooks</span></label>
                  <label class="plugin-card"><input id="pluginQr" type="checkbox"><strong>QR / Barcode</strong><span>Scanner Bridge</span></label>
                  <label class="plugin-card"><input id="pluginFcm" type="checkbox"><strong>Firebase Cloud Messaging</strong><span>Push Notifications</span></label>
                </div>
                <div class="notice">Alpha1 speichert die Plugin-Auswahl vollständig. Quantum NMP und Asset Store existieren bereits im Wrapper; weitere Module werden schrittweise an die Runtime gekoppelt.</div>
              </section>

              <section class="terran-panel editor-section is-hidden" data-editor-section="build">
                <div class="kicker">APP::BUILD_DEPLOY</div><h3>Build & Deploy</h3>
                <div class="field-grid">
                  <label><span class="field-label">Android Package ID</span><input class="field mono" id="packageId" required></label>
                  <label><span class="field-label">Version Name</span><input class="field mono" id="versionName" required></label>
                  <label><span class="field-label">Version Code</span><input class="field" id="versionCode" type="number" min="1" required></label>
                  <label><span class="field-label">Minimum SDK</span><input class="field" id="minSdk" type="number" min="23" max="36"></label>
                  <label><span class="field-label">Target SDK</span><input class="field" id="targetSdk" type="number" min="23" max="36"></label>
                </div>
                <div class="build-command-row">
                  <button id="rebuildAllButton" class="btn primary" type="button">REBUILD ALL</button>
                  <span class="muted">Erzeugt APK + AAB + Source ZIP + SHA256SUMS in einem Lauf.</span>
                </div>
                <div id="buildList" class="build-list"></div>
              </section>
            </form>

            <aside class="simulator-panel terran-panel">
              <div class="sim-head"><div><div class="kicker">SIMULATOR</div><strong id="simAppName">APP PREVIEW</strong></div><span class="chip">ANDROID</span></div>
              <div class="device-frame">
                <div class="device-status">QUANTUM RUNTIME</div>
                <iframe id="simulatorFrame" title="App preview" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
                <div id="simFallback" class="sim-fallback">Start-URL speichern, um die Vorschau zu laden.</div>
              </div>
              <div class="sim-meta"><span id="simPackage">package</span><span id="simVersion">version</span></div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  </div>

  <dialog id="newAppDialog" class="terran-dialog">
    <form id="newAppForm" method="dialog" class="terran-panel dialog-card">
      <div class="kicker">QUANTUM::NEW_PROFILE</div><h3>Neue App</h3>
      <label><span class="field-label">App Name</span><input id="newAppName" class="field" required maxlength="80"></label>
      <label><span class="field-label">Start URL</span><input id="newStartUrl" class="field mono" type="url" required placeholder="https://example.com/"></label>
      <label><span class="field-label">Package ID</span><input id="newPackageId" class="field mono" required placeholder="de.starlightunit.app"></label>
      <div class="dialog-actions"><button class="btn" value="cancel">Abbruch</button><button id="createAppButton" class="btn primary" value="default">Profil anlegen</button></div>
    </form>
  </dialog>

  <script>window.QB_BOOT = <?= json_encode(['authenticated' => $authenticated, 'csrf' => $authenticated ? $auth->csrf() : null, 'version' => Config::version()], JSON_UNESCAPED_SLASHES) ?>;</script>
  <script src="/assets/app.js?v=<?= htmlspecialchars(Config::version(), ENT_QUOTES) ?>" defer></script>
</body>
</html>
