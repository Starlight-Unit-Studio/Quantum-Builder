<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Auth.php';

use QuantumBuilder\Auth;
use QuantumBuilder\Database;

$db = new Database();
$db->migrate();

if ((string) (getenv('QB_BOOTSTRAP_CHECK_ONLY') ?: '') === '1') {
    $count = (int) $db->pdo()->query('SELECT COUNT(*) FROM users')->fetchColumn();
    exit($count > 0 ? 0 : 10);
}

$email = trim((string) (getenv('QB_BOOTSTRAP_ADMIN_EMAIL') ?: ''));
$password = (string) (getenv('QB_BOOTSTRAP_ADMIN_PASSWORD') ?: '');
if ($email !== '' || $password !== '') {
    if ($email === '' || $password === '') {
        fwrite(STDERR, "Both QB_BOOTSTRAP_ADMIN_EMAIL and QB_BOOTSTRAP_ADMIN_PASSWORD are required.\n");
        exit(2);
    }
    (new Auth($db->pdo()))->createAdmin($email, $password);
    fwrite(STDOUT, "Quantum Builder administrator is ready.\n");
}
