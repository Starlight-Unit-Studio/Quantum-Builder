<?php

declare(strict_types=1);

namespace QuantumBuilder;

use PDO;

final class Database
{
    private PDO $pdo;

    public function __construct(?string $path = null)
    {
        $path ??= Config::databasePath();
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new \RuntimeException('Unable to create data directory.');
        }

        $this->pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->pdo->exec('PRAGMA journal_mode=WAL');
        $this->pdo->exec('PRAGMA foreign_keys=ON');
        $this->pdo->exec('PRAGMA busy_timeout=5000');
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    public function migrate(): void
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    package_id TEXT NOT NULL UNIQUE,
    start_url TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    version_name TEXT NOT NULL DEFAULT '0.1.0',
    version_code INTEGER NOT NULL DEFAULT 0,
    min_sdk INTEGER NOT NULL DEFAULT 23,
    target_sdk INTEGER NOT NULL DEFAULT 36,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'queued',
    message TEXT NOT NULL DEFAULT '',
    wrapper_ref TEXT NOT NULL DEFAULT '',
    artifact_dir TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT NULL,
    finished_at TEXT NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_builds_queue ON builds(status, id);
CREATE INDEX IF NOT EXISTS idx_builds_app ON builds(app_id, id DESC);
SQL;
        $this->pdo->exec($sql);
    }

    private function __clone()
    {
    }
}
