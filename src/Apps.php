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
        $input = $this->stripServerManagedConfig($input);
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
        $existing = $this->find($id);
        if (!$existing) {
            throw new \InvalidArgumentException('App not found.');
        }
        $assets = $existing['config']['branding']['assets'] ?? [];
        $input = $this->stripServerManagedConfig($input);
        $data = $this->validate($input);
        $config = json_decode((string) $data['config_json'], true) ?: [];
        if (is_array($assets) && $assets !== []) {
            $config['branding'] = is_array($config['branding'] ?? null) ? $config['branding'] : [];
            $config['branding']['assets'] = $assets;
        }
        $data['config_json'] = json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $stmt = $this->pdo->prepare(
            'UPDATE apps SET name=:name, package_id=:package_id, start_url=:start_url, description=:description,
             version_name=:version_name, version_code=:version_code, min_sdk=:min_sdk, target_sdk=:target_sdk,
             config_json=:config_json, updated_at=CURRENT_TIMESTAMP WHERE id=:id'
        );
        $stmt->execute($data + ['id' => $id]);
        return $this->find($id) ?? throw new \RuntimeException('App update failed.');
    }

    public function setBrandingAsset(int $id, string $kind, ?array $metadata): array
    {
        if (!in_array($kind, Assets::KINDS, true)) {
            throw new \InvalidArgumentException('Unbekannter Asset-Typ.');
        }
        $app = $this->find($id);
        if (!$app) {
            throw new \InvalidArgumentException('App not found.');
        }
        $config = is_array($app['config'] ?? null) ? $app['config'] : [];
        $config['branding'] = is_array($config['branding'] ?? null) ? $config['branding'] : [];
        $config['branding']['assets'] = is_array($config['branding']['assets'] ?? null) ? $config['branding']['assets'] : [];
        if ($metadata === null) {
            unset($config['branding']['assets'][$kind]);
        } else {
            $config['branding']['assets'][$kind] = $metadata;
        }
        $stmt = $this->pdo->prepare('UPDATE apps SET config_json=:config_json, updated_at=CURRENT_TIMESTAMP WHERE id=:id');
        $stmt->execute([
            'config_json' => json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'id' => $id,
        ]);
        return $this->find($id) ?? throw new \RuntimeException('Branding asset update failed.');
    }

    private function stripServerManagedConfig(array $input): array
    {
        if (!is_array($input['config'] ?? null)) {
            return $input;
        }
        $config = $input['config'];
        if (is_array($config['branding'] ?? null)) {
            unset($config['branding']['assets']);
        }
        $input['config'] = $config;
        return $input;
    }

    private function validate(array $input): array
    {
        $name = trim((string) ($input['name'] ?? ''));
        $packageId = trim((string) ($input['package_id'] ?? ''));
        $startUrl = trim((string) ($input['start_url'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $versionName = trim((string) ($input['version_name'] ?? '0.1.0'));
        $versionCode = (int) ($input['version_code'] ?? 1);
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
        if ($versionCode < 1) {
            throw new \InvalidArgumentException('Version code must be greater than zero.');
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
            ],
            'branding' => ['assets' => []],
            'interface' => [
                'dark_mode' => 'dark', 'orientation' => 'auto', 'keep_screen_on' => false,
                'fullscreen' => false, 'page_transitions' => true, 'pull_to_refresh' => false,
                'pinch_to_zoom' => false, 'font_scale' => 100,
            ],
            'navigation' => ['top_bar' => false, 'sidebar' => false, 'bottom_tabs' => false, 'contextual_toolbar' => false],
            'links' => ['new_windows' => 'blocked', 'deep_link_scheme' => ''],
            'permissions' => [
                'location' => false, 'microphone' => false, 'camera' => false,
                'public_downloads' => true, 'background_audio' => false,
            ],
            'web' => [
                'user_agent_suffix' => ' QuantumMobileWrapper', 'custom_headers' => [],
                'custom_css' => '', 'custom_js' => '', 'cookie_persistence' => 'default',
            ],
            'plugins' => [
                'quantum_nmp' => false, 'quantum_asset_store' => false, 'share' => false,
                'haptics' => false, 'biometrics' => false, 'qr_scanner' => false, 'push_fcm' => false,
            ],
            'wrapper_ref' => (string) (getenv('QB_WRAPPER_REF') ?: 'compat/android-6-api23'),
        ];

        $config = array_replace_recursive($defaults, $config);
        $config['trusted_domain'] = trim((string) ($config['trusted_domain'] ?? $url['host']));
        if ($config['trusted_domain'] === '' || !preg_match('/^[A-Za-z0-9.-]+$/', $config['trusted_domain'])) {
            throw new \InvalidArgumentException('Trusted domain is invalid.');
        }

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

    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['version_code'] = (int) $row['version_code'];
        $row['min_sdk'] = (int) $row['min_sdk'];
        $row['target_sdk'] = (int) $row['target_sdk'];
        $row['config'] = json_decode((string) $row['config_json'], true) ?: [];
        unset($row['config_json']);
        return $row;
    }
}
