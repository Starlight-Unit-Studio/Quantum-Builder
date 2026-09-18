<?php

declare(strict_types=1);

namespace QuantumBuilder;

use PDO;

final class Apps
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function all(): array
    {
        return array_map([$this, 'hydrate'], $this->pdo->query('SELECT * FROM apps ORDER BY updated_at DESC, id DESC')->fetchAll());
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM apps WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ? $this->hydrate($row) : null;
    }

    public function create(array $input): array
    {
        $data = $this->validate($input);
        $stmt = $this->pdo->prepare(
            'INSERT INTO apps (uuid, name, package_id, start_url, description, version_name, version_code, min_sdk, target_sdk, config_json)
             VALUES (:uuid, :name, :package_id, :start_url, :description, :version_name, :version_code, :min_sdk, :target_sdk, :config_json)'
        );
        $stmt->execute($data + ['uuid' => bin2hex(random_bytes(16))]);
        return $this->find((int) $this->pdo->lastInsertId()) ?? throw new \RuntimeException('App creation failed.');
    }

    public function update(int $id, array $input): array
    {
        if (!$this->find($id)) {
            throw new \InvalidArgumentException('App not found.');
        }
        $data = $this->validate($input);
        unset($data['version_code']);
        $stmt = $this->pdo->prepare(
            'UPDATE apps SET name=:name, package_id=:package_id, start_url=:start_url, description=:description,
             version_name=:version_name, min_sdk=:min_sdk, target_sdk=:target_sdk,
             config_json=:config_json, updated_at=CURRENT_TIMESTAMP WHERE id=:id'
        );
        $stmt->execute($data + ['id' => $id]);
        return $this->find($id) ?? throw new \RuntimeException('App update failed.');
    }

    private function validate(array $input): array
    {
        $name = trim((string) ($input['name'] ?? ''));
        $packageId = trim((string) ($input['package_id'] ?? ''));
        $startUrl = trim((string) ($input['start_url'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $versionName = trim((string) ($input['version_name'] ?? '0.1.0'));
        $versionCode = (int) ($input['version_code'] ?? 0);
        $minSdk = (int) ($input['min_sdk'] ?? 23);
        $targetSdk = (int) ($input['target_sdk'] ?? 36);
        $config = is_array($input['config'] ?? null) ? $input['config'] : [];

        if ($name === '' || strlen($name) > 160) {
            throw new \InvalidArgumentException('App name is required and must be at most 80 typical characters.');
        }
        if (!preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/', $packageId)) {
            throw new \InvalidArgumentException('Package ID is invalid.');
        }
        $url = parse_url($startUrl);
        if (!$url || ($url['scheme'] ?? '') !== 'https' || empty($url['host'])) {
            throw new \InvalidArgumentException('Start URL must be a valid HTTPS URL.');
        }
        if ($versionName === '' || strlen($versionName) > 40) {
            throw new \InvalidArgumentException('Version name is invalid.');
        }
        if ($versionCode < 0) {
            throw new \InvalidArgumentException('Version code must not be negative.');
        }
        if ($minSdk < 23 || $minSdk > 36) {
            throw new \InvalidArgumentException('Minimum SDK must be between 23 and 36.');
        }
        if ($targetSdk < $minSdk || $targetSdk > 36) {
            throw new \InvalidArgumentException('Target SDK must be between minSdk and 36.');
        }

        $defaults = [
            'trusted_domain' => (string) $url['host'],
            'theme' => [
                'primary' => '#6fc7ff', 'accent' => '#ffd978', 'status_bar' => '#020611',
                'navigation_bar' => '#020611', 'splash_background' => '#020611',
                'app_icon_data_url' => '',
            ],
            'interface' => [
                'dark_mode' => 'dark', 'orientation' => 'auto', 'keep_screen_on' => false,
                'fullscreen' => false, 'page_transitions' => true, 'pull_to_refresh' => false,
                'pinch_to_zoom' => false, 'font_scale' => 100,
            ],
            'navigation' => [
                'top_bar' => false, 'sidebar' => false, 'bottom_tabs' => false, 'contextual_toolbar' => false,
                'title' => $name, 'background' => '#020611', 'foreground' => '#ffffff', 'accent' => '#6fc7ff',
                'items' => [],
            ],
            'links' => ['new_windows' => 'blocked', 'deep_link_scheme' => ''],
            'permissions' => [
                'location' => false, 'microphone' => false, 'camera' => false,
                'public_downloads' => true, 'background_audio' => false,
            ],
            'web' => [
                'user_agent_suffix' => ' QuantumMobileWrapper', 'custom_headers' => [],
                'custom_css' => '', 'custom_js' => '', 'cookie_persistence' => 'persistent',
            ],
            'plugins' => [
                'quantum_nmp' => false, 'quantum_asset_store' => false, 'native_asset_downloader' => false,
                'share' => false, 'haptics' => false, 'biometrics' => false, 'qr_scanner' => false, 'push_fcm' => false,
            ],
            'asset_sync' => [
                'manifest_url' => '',
                'roots' => "/assets/portraits/",
            ],
            'wrapper_ref' => (string) (getenv('QB_WRAPPER_REF') ?: 'compat/android-6-api23'),
        ];

        $config = array_replace_recursive($defaults, $config);
        $config['trusted_domain'] = trim((string) ($config['trusted_domain'] ?? $url['host']));
        if ($config['trusted_domain'] === '' || !preg_match('/^[A-Za-z0-9.-]+$/', $config['trusted_domain'])) {
            throw new \InvalidArgumentException('Trusted domain is invalid.');
        }

        if (!isset($config['interface']) || !is_array($config['interface'])) {
            $config['interface'] = $defaults['interface'];
        }
        foreach (['keep_screen_on', 'fullscreen', 'page_transitions', 'pull_to_refresh', 'pinch_to_zoom'] as $booleanField) {
            if (!is_bool($config['interface'][$booleanField] ?? null)) {
                throw new \InvalidArgumentException('Interface toggle values must be boolean.');
            }
        }
        $fontScale = $config['interface']['font_scale'] ?? 100;
        if (!is_int($fontScale) && !(is_string($fontScale) && ctype_digit($fontScale))) {
            throw new \InvalidArgumentException('Font scale must be an integer percentage.');
        }
        $fontScale = (int) $fontScale;
        if ($fontScale < 50 || $fontScale > 200) {
            throw new \InvalidArgumentException('Font scale must be between 50 and 200 percent.');
        }
        $config['interface']['font_scale'] = $fontScale;

        $darkMode = strtolower(trim((string) ($config['interface']['dark_mode'] ?? 'dark')));
        if (!in_array($darkMode, ['dark', 'light', 'auto'], true)) {
            throw new \InvalidArgumentException('Dark mode must be dark, light or auto.');
        }
        $config['interface']['dark_mode'] = $darkMode;

        if (!isset($config['theme']) || !is_array($config['theme'])) {
            $config['theme'] = $defaults['theme'];
        }
        foreach (['primary', 'accent', 'status_bar', 'navigation_bar', 'splash_background'] as $colorField) {
            $color = strtolower(trim((string) ($config['theme'][$colorField] ?? $defaults['theme'][$colorField])));
            if (!preg_match('/^#[0-9a-f]{6}$/', $color)) {
                throw new \InvalidArgumentException('Theme colors must use #RRGGBB.');
            }
            $config['theme'][$colorField] = $color;
        }

        if (!isset($config['navigation']) || !is_array($config['navigation'])) {
            $config['navigation'] = $defaults['navigation'];
        }
        foreach (['top_bar', 'sidebar', 'bottom_tabs', 'contextual_toolbar'] as $booleanField) {
            if (!is_bool($config['navigation'][$booleanField] ?? null)) {
                throw new \InvalidArgumentException('Native navigation toggle values must be boolean.');
            }
        }
        $navigationTitle = trim((string) ($config['navigation']['title'] ?? $name));
        if (strlen($navigationTitle) > 160) {
            throw new \InvalidArgumentException('Native navigation title is too long.');
        }
        $config['navigation']['title'] = $navigationTitle;

        foreach (['background', 'foreground', 'accent'] as $colorField) {
            $color = strtolower(trim((string) ($config['navigation'][$colorField] ?? $defaults['navigation'][$colorField])));
            if (!preg_match('/^#[0-9a-f]{6}$/', $color)) {
                throw new \InvalidArgumentException('Native navigation colors must use #RRGGBB.');
            }
            $config['navigation'][$colorField] = $color;
        }

        $navigationItems = $config['navigation']['items'] ?? [];
        if (!is_array($navigationItems) || ($navigationItems !== [] && !array_is_list($navigationItems))) {
            throw new \InvalidArgumentException('Native navigation items must be a JSON array.');
        }
        if (count($navigationItems) > 12) {
            throw new \InvalidArgumentException('Native navigation supports at most 12 items.');
        }
        $normalizedNavigationItems = [];
        foreach ($navigationItems as $item) {
            if (!is_array($item)) {
                throw new \InvalidArgumentException('Each native navigation item must be an object.');
            }
            $label = trim((string) ($item['label'] ?? ''));
            $target = trim((string) ($item['url'] ?? ''));
            if ($label === '' || strlen($label) > 80) {
                throw new \InvalidArgumentException('Native navigation labels must contain 1 to 40 typical characters.');
            }
            if ($target === '' || strlen($target) > 2048 || preg_match('/[\r\n]/', $target)) {
                throw new \InvalidArgumentException('Native navigation URL is invalid.');
            }
            if (!$this->isTrustedNavigationTarget($target, strtolower($config['trusted_domain']))) {
                throw new \InvalidArgumentException('Native navigation targets must be relative or trusted HTTPS URLs.');
            }
            $normalizedNavigationItems[] = ['label' => $label, 'url' => $target];
        }
        $config['navigation']['items'] = $normalizedNavigationItems;

        if (!isset($config['web']) || !is_array($config['web'])) {
            $config['web'] = $defaults['web'];
        }
        $config['web']['custom_headers'] = (object) $this->normalizeCustomHeaders($config['web']['custom_headers'] ?? []);

        $customCss = $config['web']['custom_css'] ?? '';
        $customJs = $config['web']['custom_js'] ?? '';
        if (!is_string($customCss) || strlen($customCss) > 49152) {
            throw new \InvalidArgumentException('Custom CSS must be text up to 48 KiB.');
        }
        if (!is_string($customJs) || strlen($customJs) > 49152) {
            throw new \InvalidArgumentException('Custom JavaScript must be text up to 48 KiB.');
        }
        $config['web']['custom_css'] = $customCss;
        $config['web']['custom_js'] = $customJs;

        $cookieMode = strtolower(trim((string) ($config['web']['cookie_persistence'] ?? 'persistent')));
        if ($cookieMode === 'default') {
            $cookieMode = 'persistent';
        }
        if (!in_array($cookieMode, ['persistent', 'server', 'session'], true)) {
            throw new \InvalidArgumentException('Cookie persistence mode is invalid.');
        }
        $config['web']['cookie_persistence'] = $cookieMode;

        $config['theme']['app_icon_data_url'] = $this->normalizeAppIconDataUrl(
            $config['theme']['app_icon_data_url'] ?? ''
        );

        return [
            'name' => $name,
            'package_id' => $packageId,
            'start_url' => $startUrl,
            'description' => $description,
            'version_name' => $versionName,
            'version_code' => $versionCode,
            'min_sdk' => $minSdk,
            'target_sdk' => $targetSdk,
            'config_json' => json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ];
    }

    private function isTrustedNavigationTarget(string $target, string $trustedDomain): bool
    {
        if (str_starts_with($target, '//')) {
            return false;
        }
        if (!preg_match('/^[A-Za-z][A-Za-z0-9+.-]*:/', $target)) {
            return true;
        }

        $url = parse_url($target);
        if (!$url || strtolower((string) ($url['scheme'] ?? '')) !== 'https') {
            return false;
        }
        $host = strtolower((string) ($url['host'] ?? ''));
        return $host === $trustedDomain || str_ends_with($host, '.' . $trustedDomain);
    }

    private function normalizeAppIconDataUrl(mixed $value): string
    {
        if (!is_string($value) || $value === '') {
            return '';
        }
        if (strlen($value) > 900000) {
            throw new \InvalidArgumentException('App icon is too large.');
        }
        if (!preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $value)) {
            throw new \InvalidArgumentException('App icon must be PNG, JPEG or WebP.');
        }
        return $value;
    }

    private function normalizeCustomHeaders(mixed $headers): array
    {
        if (is_string($headers)) {
            $decoded = json_decode($headers, true);
            $headers = is_array($decoded) ? $decoded : [];
        } elseif (is_object($headers)) {
            $headers = get_object_vars($headers);
        }

        if (!is_array($headers)) {
            return [];
        }
        if ($headers !== [] && array_is_list($headers)) {
            return [];
        }
        return $headers;
    }

    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['version_code'] = (int) $row['version_code'];
        $row['min_sdk'] = (int) $row['min_sdk'];
        $row['target_sdk'] = (int) $row['target_sdk'];
        $config = json_decode((string) $row['config_json'], true) ?: [];
        if (!isset($config['web']) || !is_array($config['web'])) {
            $config['web'] = [];
        }
        $config['web']['custom_headers'] = (object) $this->normalizeCustomHeaders($config['web']['custom_headers'] ?? []);
        $cookieMode = strtolower(trim((string) ($config['web']['cookie_persistence'] ?? 'persistent')));
        $config['web']['cookie_persistence'] = in_array($cookieMode, ['server', 'session'], true)
            ? $cookieMode
            : 'persistent';
        $row['config'] = $config;
        unset($row['config_json']);
        return $row;
    }
}
