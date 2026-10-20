<?php

declare(strict_types=1);

namespace QuantumBuilder;

use PDO;

final class Apps
{
    // Keep these identifiers in sync with navigation-icons.js and the wrapper policy.
    private const NAVIGATION_ICON_IDS = [
        'home', 'search', 'grid', 'star', 'heart', 'user', 'settings', 'info', 'mail', 'cart',
        'calendar', 'camera', 'map', 'phone', 'download', 'help', 'play', 'folder', 'globe', 'link',
    ];

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
                'app_icon_data_url' => '', 'custom_splash_data_url' => '',
                'attribution_banner_duration_ms' => 3000,
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
            'links' => ['new_windows' => 'blocked', 'deep_link_scheme' => '', 'rules' => []],
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

        $config['navigation']['items'] = $this->normalizeNavigationItems(
            array_key_exists('items', $config['navigation']) ? $config['navigation']['items'] : [],
            strtolower($config['trusted_domain'])
        );

        if (!isset($config['links']) || !is_array($config['links'])) {
            $config['links'] = $defaults['links'];
        }
        $newWindowPolicy = strtolower(trim((string) ($config['links']['new_windows'] ?? 'blocked')));
        if (!in_array($newWindowPolicy, ['blocked', 'internal', 'external'], true)) {
            throw new \InvalidArgumentException('New-window policy is invalid.');
        }
        $config['links']['new_windows'] = $newWindowPolicy;

        $deepLinkScheme = strtolower(trim((string) ($config['links']['deep_link_scheme'] ?? '')));
        if ($deepLinkScheme !== '' && !preg_match('/^[a-z][a-z0-9+.-]{1,31}$/', $deepLinkScheme)) {
            throw new \InvalidArgumentException('Deep-link scheme is invalid.');
        }
        if (in_array($deepLinkScheme, ['http', 'https', 'mailto', 'tel', 'geo', 'market', 'intent'], true)) {
            throw new \InvalidArgumentException('Deep-link scheme conflicts with a reserved protocol.');
        }
        $config['links']['deep_link_scheme'] = $deepLinkScheme;

        $linkRules = $config['links']['rules'] ?? [];
        if (!is_array($linkRules) || ($linkRules !== [] && !array_is_list($linkRules))) {
            throw new \InvalidArgumentException('Link rules must be a JSON array.');
        }
        if (count($linkRules) > 64) {
            throw new \InvalidArgumentException('Link handling supports at most 64 rules.');
        }
        $normalizedLinkRules = [];
        foreach ($linkRules as $rule) {
            if (!is_array($rule)) {
                throw new \InvalidArgumentException('Each link rule must be an object.');
            }
            $action = strtolower(trim((string) ($rule['action'] ?? '')));
            if (!in_array($action, ['internal', 'external', 'block'], true)) {
                throw new \InvalidArgumentException('Link rule action must be internal, external or block.');
            }
            $scheme = strtolower(trim((string) ($rule['scheme'] ?? '')));
            $host = strtolower(trim((string) ($rule['host'] ?? '')));
            $pathPrefix = trim((string) ($rule['path_prefix'] ?? ''));
            if ($scheme !== '' && !preg_match('/^[a-z][a-z0-9+.-]*$/', $scheme)) {
                throw new \InvalidArgumentException('Link rule scheme is invalid.');
            }
            if ($host !== '' && !preg_match('/^(\*\.)?[a-z0-9.-]+$/', $host)) {
                throw new \InvalidArgumentException('Link rule host is invalid.');
            }
            if ($pathPrefix !== '' && !str_starts_with($pathPrefix, '/')) {
                throw new \InvalidArgumentException('Link rule path_prefix must start with /.');
            }
            if ($scheme === '' && $host === '' && $pathPrefix === '') {
                throw new \InvalidArgumentException('Link rules need at least one matcher.');
            }
            if ($action === 'internal') {
                if ($scheme !== '' && $scheme !== 'https') {
                    throw new \InvalidArgumentException('Internal link rules may only match HTTPS.');
                }
                if ($host !== '') {
                    $plainHost = str_starts_with($host, '*.') ? substr($host, 2) : $host;
                    $trustedDomain = strtolower($config['trusted_domain']);
                    if ($plainHost !== $trustedDomain && !str_ends_with($plainHost, '.' . $trustedDomain)) {
                        throw new \InvalidArgumentException('Internal link rules must stay inside the trusted domain.');
                    }
                }
            }
            $normalizedLinkRules[] = array_filter([
                'scheme' => $scheme,
                'host' => $host,
                'path_prefix' => $pathPrefix,
                'action' => $action,
            ], static fn ($value) => $value !== '');
        }
        $config['links']['rules'] = $normalizedLinkRules;

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
        $config['theme']['custom_splash_data_url'] = $this->normalizeCustomSplashDataUrl(
            $config['theme']['custom_splash_data_url'] ?? ''
        );

        $attributionDuration = $config['theme']['attribution_banner_duration_ms'] ?? 3000;
        if (!is_int($attributionDuration)
            && !(is_string($attributionDuration) && ctype_digit($attributionDuration))) {
            throw new \InvalidArgumentException('STU attribution banner duration must be an integer.');
        }
        $attributionDuration = (int) $attributionDuration;
        if ($attributionDuration < 2000 || $attributionDuration > 4000) {
            throw new \InvalidArgumentException('STU attribution banner duration must be between 2000 and 4000 ms.');
        }
        $config['theme']['attribution_banner_duration_ms'] = $attributionDuration;

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

    private function normalizeNavigationItems(mixed $items, string $trustedDomain): array
    {
        $links = 0;
        $groups = 0;
        $nodes = 0;
        $groupIds = [];
        $walk = function (mixed $items, int $depth) use (&$walk, &$links, &$groups, &$nodes, &$groupIds, $trustedDomain): array {
            if (!is_array($items) || !array_is_list($items)) {
                throw new \InvalidArgumentException('Native navigation items and group children must be JSON arrays.');
            }
            $normalized = [];
            foreach ($items as $item) {
                if (++$nodes > 24) {
                    throw new \InvalidArgumentException('Native navigation supports at most 24 total menu nodes.');
                }
                if (!is_array($item) || array_is_list($item)) {
                    throw new \InvalidArgumentException('Each native navigation item must be an object.');
                }
                $type = array_key_exists('type', $item) ? $item['type'] : 'link';
                if (!in_array($type, ['link', 'group'], true)) {
                    throw new \InvalidArgumentException('Native navigation item type must be link or group.');
                }
                if (!is_string($item['label'] ?? null)) {
                    throw new \InvalidArgumentException('Native navigation labels must be text.');
                }
                $label = trim($item['label']);
                if ($label === '' || strlen($label) > 80) {
                    throw new \InvalidArgumentException('Native navigation labels must contain 1 to 80 UTF-8 bytes.');
                }
                if ($type === 'group') {
                    if (++$groups > 12 || $depth >= 3) {
                        throw new \InvalidArgumentException('Native navigation supports at most 12 groups and 3 nested group levels.');
                    }
                    $id = $item['id'] ?? null;
                    if (!is_string($id) || !preg_match('/\A[a-z][a-z0-9_-]{0,39}\z/', $id)
                        || isset($groupIds[$id])) {
                        throw new \InvalidArgumentException('Navigation group IDs must be unique lowercase identifiers of at most 40 characters.');
                    }
                    if (array_key_exists('url', $item)) {
                        throw new \InvalidArgumentException('Navigation groups cannot have a URL.');
                    }
                    $collapsed = array_key_exists('collapsed', $item) ? $item['collapsed'] : false;
                    if (!is_bool($collapsed)) {
                        throw new \InvalidArgumentException('Navigation group collapsed must be boolean.');
                    }
                    $groupIds[$id] = true;
                    $current = [
                        'type' => 'group', 'id' => $id, 'label' => $label, 'collapsed' => $collapsed,
                        'children' => $walk($item['children'] ?? null, $depth + 1),
                    ];
                } else {
                    if (++$links > 12) {
                        throw new \InvalidArgumentException('Native navigation supports at most 12 link destinations.');
                    }
                    foreach (['children', 'id', 'collapsed'] as $groupField) {
                        if (array_key_exists($groupField, $item)) {
                            throw new \InvalidArgumentException('Link destinations cannot have group-only fields.');
                        }
                    }
                    if (!is_string($item['url'] ?? null)) {
                        throw new \InvalidArgumentException('Native navigation URL must be text.');
                    }
                    $target = trim($item['url']);
                    if ($target === '' || strlen($target) > 2048 || !$this->isTrustedNavigationTarget($target, $trustedDomain)) {
                        throw new \InvalidArgumentException('Native navigation targets must be valid relative or trusted HTTPS URLs.');
                    }
                    $current = ['label' => $label, 'url' => $target];
                }
                foreach (['icon', 'active_icon'] as $field) {
                    if (array_key_exists($field, $item)) {
                        $icon = $this->normalizeNavigationIcon($item[$field]);
                        if ($icon !== '') {
                            $current[$field] = $icon;
                        }
                    }
                }
                $normalized[] = $current;
            }
            return $normalized;
        };
        return $walk($items, 0);
    }

    private function normalizeNavigationIcon(mixed $value): string
    {
        if (!is_string($value)) {
            throw new \InvalidArgumentException('Navigation icons must be icon identifiers or PNG data URLs.');
        }
        $value = trim($value);
        if ($value === '' || in_array($value, self::NAVIGATION_ICON_IDS, true)) {
            return $value;
        }
        if (strlen($value) > 87_406
            || !preg_match('#\Adata:image/png;base64,([A-Za-z0-9+/]+={0,2})\z#', $value, $matches)) {
            throw new \InvalidArgumentException('Navigation icons must be a built-in icon or a PNG up to 64 KiB.');
        }
        $payload = base64_decode($matches[1], true);
        if ($payload === false || base64_encode($payload) !== $matches[1]
            || strlen($payload) > 65_536 || !str_starts_with($payload, "\x89PNG\r\n\x1a\n")) {
            throw new \InvalidArgumentException('Navigation icon PNG data is invalid.');
        }
        $this->validateNavigationPng($payload);
        return $value;
    }

    private function validateNavigationPng(string $payload): void
    {
        $invalid = static function (): never {
            throw new \InvalidArgumentException('Navigation icons need a valid static PNG, 1 to 256 pixels per side and at most 64 KiB.');
        };
        $offset = 8;
        $size = strlen($payload);
        $header = null;
        $palette = false;
        $imageData = '';
        $hasIdat = false;
        $idatEnded = false;
        $ended = false;
        while ($offset < $size) {
            if ($size - $offset < 12) {
                $invalid();
            }
            $length = unpack('N', substr($payload, $offset, 4))[1];
            if ($length > $size - $offset - 12) {
                $invalid();
            }
            $type = substr($payload, $offset + 4, 4);
            $data = substr($payload, $offset + 8, $length);
            $crc = substr($payload, $offset + 8 + $length, 4);
            if (!preg_match('/\A[A-Za-z]{4}\z/', $type) || hash('crc32b', $type . $data, true) !== $crc
                || ($header === null && $type !== 'IHDR') || $type === 'acTL') {
                $invalid();
            }
            $offset += $length + 12;
            if ($type === 'IHDR') {
                if ($header !== null || $length !== 13) {
                    $invalid();
                }
                $header = unpack('Nwidth/Nheight/Cdepth/Ccolor/Ccompression/Cfilter/Cinterlace', $data);
                $depths = [0 => [1, 2, 4, 8, 16], 2 => [8, 16], 3 => [1, 2, 4, 8], 4 => [8, 16], 6 => [8, 16]];
                if ($header['width'] < 1 || $header['width'] > 256 || $header['height'] < 1 || $header['height'] > 256
                    || !in_array($header['depth'], $depths[$header['color']] ?? [], true)
                    || $header['compression'] !== 0 || $header['filter'] !== 0 || $header['interlace'] > 1) {
                    $invalid();
                }
            } elseif ($type === 'PLTE') {
                if ($palette || $hasIdat || $length === 0 || $length > 768 || $length % 3 !== 0) {
                    $invalid();
                }
                $palette = true;
            } elseif ($type === 'IDAT') {
                if ($idatEnded || ($header['color'] === 3 && !$palette)) {
                    $invalid();
                }
                $hasIdat = true;
                $imageData .= $data;
            } elseif ($type === 'IEND') {
                if ($length !== 0 || $imageData === '' || $offset !== $size) {
                    $invalid();
                }
                $ended = true;
            } else {
                if (ctype_upper($type[0])) {
                    $invalid();
                }
                if ($hasIdat) {
                    $idatEnded = true;
                }
            }
        }
        if (!$ended || $header === null) {
            $invalid();
        }

        // Inspect the bounded filtered scanlines, without needing GD or rendering pixels.
        $channels = [0 => 1, 2 => 3, 3 => 1, 4 => 2, 6 => 4][$header['color']];
        $passes = $header['interlace'] === 0 ? [[0, 0, 1, 1]]
            : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
        $rows = [];
        $expected = 0;
        foreach ($passes as [$x, $y, $dx, $dy]) {
            $width = max(0, intdiv($header['width'] - $x + $dx - 1, $dx));
            $height = max(0, intdiv($header['height'] - $y + $dy - 1, $dy));
            if ($width === 0 || $height === 0) {
                continue;
            }
            $rowSize = 1 + intdiv($width * $channels * $header['depth'] + 7, 8);
            $rows[] = [$rowSize, $height];
            $expected += $rowSize * $height;
        }
        $decoded = @gzuncompress($imageData, $expected);
        if ($decoded === false || strlen($decoded) !== $expected) {
            $invalid();
        }
        // The bounded decode succeeded, so inspecting its exact stream consumption is safe.
        $inflater = inflate_init(ZLIB_ENCODING_DEFLATE);
        if ($inflater === false || @inflate_add($inflater, $imageData, ZLIB_FINISH) === false
            || inflate_get_status($inflater) !== ZLIB_STREAM_END || inflate_get_read_len($inflater) !== strlen($imageData)) {
            $invalid();
        }
        $offset = 0;
        foreach ($rows as [$rowSize, $height]) {
            for ($row = 0; $row < $height; $row++) {
                if (ord($decoded[$offset]) > 4) {
                    $invalid();
                }
                $offset += $rowSize;
            }
        }
    }

    private function isTrustedNavigationTarget(string $target, string $trustedDomain): bool
    {
        if (str_starts_with($target, '//')
            || preg_match('/[\s\\\\<>"{}|^\[\]\x00-\x1f\x7f]/u', $target)
            || preg_match('/%(?![0-9a-f]{2})/i', $target)) {
            return false;
        }
        if (!preg_match('/^[A-Za-z][A-Za-z0-9+.-]*:/', $target)) {
            return true;
        }

        $url = parse_url($target);
        if (!$url || strtolower((string) ($url['scheme'] ?? '')) !== 'https'
            || isset($url['user']) || isset($url['pass'])
            || !preg_match('#\Ahttps://[a-z0-9.-]+(?::[0-9]+)?(?:[/?\#]|\z)#i', $target)) {
            return false;
        }
        $host = strtolower((string) ($url['host'] ?? ''));
        return $host === $trustedDomain || str_ends_with($host, '.' . $trustedDomain);
    }

    private function normalizeCustomSplashDataUrl(mixed $value): string
    {
        if (!is_string($value) || $value === '') {
            return '';
        }
        if (strlen($value) > 4_300_000) {
            throw new \InvalidArgumentException('Custom splash is too large.');
        }
        if (!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $value, $matches)) {
            throw new \InvalidArgumentException('Custom splash must be PNG, JPEG or WebP.');
        }

        $payload = base64_decode($matches[2], true);
        if ($payload === false || $payload === '' || strlen($payload) > 3 * 1024 * 1024) {
            throw new \InvalidArgumentException('Custom splash must be between 1 byte and 3 MiB.');
        }

        $type = $matches[1];
        $valid = match ($type) {
            'png' => str_starts_with($payload, "\x89PNG\r\n\x1a\n"),
            'jpeg' => str_starts_with($payload, "\xff\xd8\xff"),
            'webp' => strlen($payload) >= 12
                && substr($payload, 0, 4) === 'RIFF'
                && substr($payload, 8, 4) === 'WEBP',
            default => false,
        };
        if (!$valid) {
            throw new \InvalidArgumentException('Custom splash image signature is invalid.');
        }

        return $value;
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
