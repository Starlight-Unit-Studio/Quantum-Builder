<?php

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Assets;

header('Cache-Control: no-store');

$apps = new Apps($db->pdo());
$assets = new Assets();
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

$reply = static function (array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
};

try {
    $auth->requireLogin();
    $appId = (int) ($_GET['app_id'] ?? $_POST['app_id'] ?? 0);
    $kind = (string) ($_GET['kind'] ?? $_POST['kind'] ?? '');
    $app = $apps->find($appId);
    if (!$app) {
        $reply(['ok' => false, 'error' => 'not_found'], 404);
    }

    if ($method === 'GET') {
        $asset = $assets->resolve($app, $kind);
        if (!$asset) {
            http_response_code(404);
            exit;
        }
        $path = (string) $asset['absolute_path'];
        header('Content-Type: ' . (string) ($asset['mime'] ?? 'application/octet-stream'));
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: inline; filename="' . basename($path) . '"');
        readfile($path);
        exit;
    }

    if ($method !== 'POST') {
        $reply(['ok' => false, 'error' => 'method_not_allowed'], 405);
    }
    $auth->verifyCsrf($_SERVER['HTTP_X_QB_CSRF'] ?? null);

    $operation = (string) ($_POST['operation'] ?? 'upload');
    $config = is_array($app['config'] ?? null) ? $app['config'] : [];
    $config['branding'] = is_array($config['branding'] ?? null) ? $config['branding'] : [];
    $config['branding']['assets'] = is_array($config['branding']['assets'] ?? null) ? $config['branding']['assets'] : [];

    if ($operation === 'delete') {
        $assets->delete($app, $kind);
        unset($config['branding']['assets'][$kind]);
        $updated = $apps->update($appId, array_replace($app, ['config' => $config]));
        $reply(['ok' => true, 'app' => $updated, 'asset' => null]);
    }

    if ($operation !== 'upload') {
        throw new \InvalidArgumentException('Unbekannte Asset-Operation.');
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        throw new \InvalidArgumentException('Keine Bilddatei empfangen.');
    }

    $asset = $assets->store($app, $kind, $_FILES['file']);
    $config['branding']['assets'][$kind] = $asset;
    $updated = $apps->update($appId, array_replace($app, ['config' => $config]));
    $reply(['ok' => true, 'app' => $updated, 'asset' => $asset], 201);
} catch (\InvalidArgumentException $e) {
    $reply(['ok' => false, 'error' => 'validation_error', 'message' => $e->getMessage()], 422);
} catch (\RuntimeException $e) {
    $reply(['ok' => false, 'error' => 'runtime_error', 'message' => $e->getMessage()], 409);
} catch (\Throwable $e) {
    error_log('[Quantum Builder branding asset] ' . $e);
    $reply(['ok' => false, 'error' => 'internal_error'], 500);
}
