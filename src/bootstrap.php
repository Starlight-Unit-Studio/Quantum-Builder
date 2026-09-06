<?php

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'QuantumBuilder\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path = __DIR__ . '/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

use QuantumBuilder\Auth;
use QuantumBuilder\Config;
use QuantumBuilder\Database;

Config::sessionSecret();
$db = new Database();
$db->migrate();
$auth = new Auth($db->pdo());
$auth->bootstrapSession();
