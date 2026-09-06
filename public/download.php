<?php

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use QuantumBuilder\Builds;
use QuantumBuilder\Config;

$auth->requireLogin();
$build = (new Builds($db->pdo()))->find((int) ($_GET['build'] ?? 0));
$artifact = strtolower(trim((string) ($_GET['artifact'] ?? '')));
$allowed = [
    'apk' => 'app-release.apk',
    'aab' => 'app-release.aab',
    'source' => 'source.zip',
    'sha256' => 'SHA256SUMS',
];

if (!$build || ($build['status'] ?? '') !== 'complete' || !isset($allowed[$artifact])) {
    http_response_code(404);
    exit('Not found');
}

$artifactDir = (string) ($build['artifact_dir'] ?? '');
$base = realpath(Config::dataDir() . '/builds');
$dir = $artifactDir !== '' ? realpath($artifactDir) : false;
if (!$base || !$dir || !str_starts_with($dir . DIRECTORY_SEPARATOR, $base . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    exit('Not found');
}

$file = realpath($dir . '/' . $allowed[$artifact]);
if (!$file || !is_file($file) || !str_starts_with($file, $dir . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    exit('Not found');
}

$mime = match ($artifact) {
    'apk' => 'application/vnd.android.package-archive',
    'aab' => 'application/octet-stream',
    'source' => 'application/zip',
    default => 'text/plain; charset=utf-8',
};

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($file));
header('Content-Disposition: attachment; filename="' . basename($file) . '"');
header('X-Content-Type-Options: nosniff');
readfile($file);
