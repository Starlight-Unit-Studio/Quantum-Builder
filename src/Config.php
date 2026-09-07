<?php

declare(strict_types=1);

namespace QuantumBuilder;

final class Config
{
    public static function dataDir(): string
    {
        return rtrim((string) (getenv('QB_DATA_DIR') ?: '/var/lib/quantum-builder'), '/');
    }

    public static function databasePath(): string
    {
        return self::dataDir() . '/quantum-builder.sqlite';
    }

    public static function version(): string
    {
        return (string) (getenv('QB_VERSION') ?: '0.1.0-alpha2');
    }

    public static function sessionSecret(): string
    {
        $secret = (string) (getenv('QB_SESSION_SECRET') ?: '');
        if (strlen($secret) < 32) {
            throw new \RuntimeException('QB_SESSION_SECRET must contain at least 32 characters.');
        }
        return $secret;
    }

    private function __construct()
    {
    }
}
