<?php

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Builds;
use QuantumBuilder\Config;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$action = (string) ($_GET['action'] ?? 'session');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$payload = [];
if ($method !== 'GET') {
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'invalid_json']);
            exit;
        }
        $payload = $decoded;
    }
}

$reply = static function (array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
};

try {
    if ($action === 'session') {
        $reply([
            'ok' => true,
            'authenticated' => $auth->isLoggedIn(),
            'email' => $auth->isLoggedIn() ? (string) ($_SESSION['user_email'] ?? '') : null,
            'csrf' => $auth->isLoggedIn() ? $auth->csrf() : null,
            'version' => Config::version(),
        ]);
    }

    if ($action === 'login' && $method === 'POST') {
        if (!$auth->login((string) ($payload['email'] ?? ''), (string) ($payload['password'] ?? ''))) {
            $reply(['ok' => false, 'error' => 'invalid_credentials'], 401);
        }
        $reply(['ok' => true, 'csrf' => $auth->csrf(), 'email' => (string) ($_SESSION['user_email'] ?? '')]);
    }

    $auth->requireLogin();

    if ($method !== 'GET') {
        $auth->verifyCsrf($_SERVER['HTTP_X_QB_CSRF'] ?? null);
    }

    $apps = new Apps($db->pdo());
    $builds = new Builds($db->pdo());

    if ($action === 'logout' && $method === 'POST') {
        $auth->logout();
        $reply(['ok' => true]);
    }

    if ($action === 'apps' && $method === 'GET') {
        $reply(['ok' => true, 'apps' => $apps->all()]);
    }

    if ($action === 'app' && $method === 'GET') {
        $app = $apps->find((int) ($_GET['id'] ?? 0));
        $app ? $reply(['ok' => true, 'app' => $app]) : $reply(['ok' => false, 'error' => 'not_found'], 404);
    }

    if ($action === 'create_app' && $method === 'POST') {
        $reply(['ok' => true, 'app' => $apps->create($payload)], 201);
    }

    if ($action === 'save_app' && $method === 'POST') {
        $id = (int) ($payload['id'] ?? 0);
        $reply(['ok' => true, 'app' => $apps->update($id, $payload)]);
    }

    if ($action === 'queue_build' && $method === 'POST') {
        $app = $apps->find((int) ($payload['app_id'] ?? 0));
        if (!$app) {
            $reply(['ok' => false, 'error' => 'not_found'], 404);
        }
        $ref = trim((string) ($app['config']['wrapper_ref'] ?? ''));
        $reply(['ok' => true, 'build' => $builds->queue((int) $app['id'], $ref)], 202);
    }

    if ($action === 'builds' && $method === 'GET') {
        $reply(['ok' => true, 'builds' => $builds->forApp((int) ($_GET['app_id'] ?? 0))]);
    }

    $reply(['ok' => false, 'error' => 'route_not_found'], 404);
} catch (\InvalidArgumentException $e) {
    $reply(['ok' => false, 'error' => 'validation_error', 'message' => $e->getMessage()], 422);
} catch (\RuntimeException $e) {
    $reply(['ok' => false, 'error' => 'runtime_error', 'message' => $e->getMessage()], 409);
} catch (\Throwable $e) {
    error_log('[Quantum Builder] ' . $e);
    $reply(['ok' => false, 'error' => 'internal_error'], 500);
}
