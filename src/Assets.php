<?php

declare(strict_types=1);

namespace QuantumBuilder;

final class Assets
{
    public const KINDS = ['icon', 'splash'];
    private const MAX_BYTES = 12 * 1024 * 1024;
    private const MIME_EXTENSIONS = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];

    public function store(array $app, string $kind, array $file): array
    {
        $kind = $this->validateKind($kind);
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \InvalidArgumentException('Upload konnte nicht verarbeitet werden.');
        }

        $tmp = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new \InvalidArgumentException('Ungültiger Upload.');
        }
        if ($size < 1 || $size > self::MAX_BYTES) {
            throw new \InvalidArgumentException('Bilddatei muss zwischen 1 Byte und 12 MiB groß sein.');
        }

        $image = @getimagesize($tmp);
        $mime = is_array($image) ? (string) ($image['mime'] ?? '') : '';
        $width = is_array($image) ? (int) ($image[0] ?? 0) : 0;
        $height = is_array($image) ? (int) ($image[1] ?? 0) : 0;
        $extension = self::MIME_EXTENSIONS[$mime] ?? null;
        if ($extension === null || $width < 1 || $height < 1) {
            throw new \InvalidArgumentException('Nur gültige PNG-, JPEG- oder WebP-Bilder sind erlaubt.');
        }
        if ($width > 8192 || $height > 8192) {
            throw new \InvalidArgumentException('Bildabmessungen dürfen 8192 × 8192 Pixel nicht überschreiten.');
        }
        if ($kind === 'icon' && ($width < 256 || $height < 256)) {
            throw new \InvalidArgumentException('App-Icons benötigen mindestens 256 × 256 Pixel; 1024 × 1024 wird empfohlen.');
        }

        $directory = $this->appDirectory($app);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new \RuntimeException('Asset-Verzeichnis konnte nicht erstellt werden.');
        }

        foreach (array_values(self::MIME_EXTENSIONS) as $oldExtension) {
            @unlink($directory . '/' . $kind . '.' . $oldExtension);
        }

        $destination = $directory . '/' . $kind . '.' . $extension;
        if (!move_uploaded_file($tmp, $destination)) {
            throw new \RuntimeException('Bilddatei konnte nicht gespeichert werden.');
        }
        chmod($destination, 0640);

        return [
            'kind' => $kind,
            'path' => $this->relativePath($app, $kind, $extension),
            'mime' => $mime,
            'width' => $width,
            'height' => $height,
            'bytes' => filesize($destination) ?: $size,
            'updated_at' => gmdate('c'),
        ];
    }

    public function delete(array $app, string $kind): void
    {
        $kind = $this->validateKind($kind);
        $directory = $this->appDirectory($app);
        foreach (array_values(self::MIME_EXTENSIONS) as $extension) {
            @unlink($directory . '/' . $kind . '.' . $extension);
        }
    }

    public function resolve(array $app, string $kind): ?array
    {
        $kind = $this->validateKind($kind);
        $metadata = $app['config']['branding']['assets'][$kind] ?? null;
        if (!is_array($metadata)) {
            return null;
        }
        $relative = (string) ($metadata['path'] ?? '');
        $expectedPrefix = 'assets/' . (string) $app['uuid'] . '/';
        if (!str_starts_with($relative, $expectedPrefix) || str_contains($relative, '..')) {
            return null;
        }
        if (!preg_match('#^assets/[a-f0-9]{32}/(?:icon|splash)\.(?:png|jpg|webp)$#', $relative)) {
            return null;
        }
        $path = Config::dataDir() . '/' . $relative;
        if (!is_file($path)) {
            return null;
        }
        return $metadata + ['absolute_path' => $path];
    }

    private function validateKind(string $kind): string
    {
        $kind = strtolower(trim($kind));
        if (!in_array($kind, self::KINDS, true)) {
            throw new \InvalidArgumentException('Unbekannter Asset-Typ.');
        }
        return $kind;
    }

    private function appDirectory(array $app): string
    {
        $uuid = (string) ($app['uuid'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $uuid)) {
            throw new \InvalidArgumentException('Ungültige App-Identität.');
        }
        return Config::dataDir() . '/assets/' . $uuid;
    }

    private function relativePath(array $app, string $kind, string $extension): string
    {
        return 'assets/' . (string) $app['uuid'] . '/' . $kind . '.' . $extension;
    }
}
