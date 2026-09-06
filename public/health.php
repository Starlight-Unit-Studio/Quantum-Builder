<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';

use QuantumBuilder\Config;
use QuantumBuilder\Database;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $db = new Database();
    $db->migrate();
    $db->pdo()->query('SELECT 1')->fetchColumn();
    echo json_encode(['ok' => true, 'service' => 'quantum-builder', 'version' => Config::version()]);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'service' => 'quantum-builder']);
}
