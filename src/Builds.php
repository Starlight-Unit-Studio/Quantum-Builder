<?php

declare(strict_types=1);

namespace QuantumBuilder;

use PDO;

final class Builds
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function queue(int $appId, string $wrapperRef): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT id FROM apps WHERE id = :id');
            $stmt->execute(['id' => $appId]);
            if (!$stmt->fetchColumn()) {
                throw new \InvalidArgumentException('App not found.');
            }

            $active = $this->pdo->prepare("SELECT id FROM builds WHERE app_id=:app_id AND status IN ('queued','building') LIMIT 1");
            $active->execute(['app_id' => $appId]);
            if ($active->fetchColumn()) {
                throw new \RuntimeException('This app already has an active build.');
            }

            $version = $this->pdo->prepare(
                'UPDATE apps SET version_code = CASE WHEN version_code < 1 THEN 1 ELSE version_code + 1 END, updated_at=CURRENT_TIMESTAMP WHERE id=:id'
            );
            $version->execute(['id' => $appId]);

            $stmt = $this->pdo->prepare(
                "INSERT INTO builds (app_id, status, stage, message, wrapper_ref) VALUES (:app_id, 'queued', 'queued', 'Build queued', :wrapper_ref)"
            );
            $stmt->execute(['app_id' => $appId, 'wrapper_ref' => $wrapperRef]);
            $buildId = (int) $this->pdo->lastInsertId();
            $this->pdo->commit();
            return $this->find($buildId) ?? throw new \RuntimeException('Build queue failed.');
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function forApp(int $appId, int $limit = 20): array
    {
        $limit = max(1, min(100, $limit));
        $stmt = $this->pdo->prepare("SELECT * FROM builds WHERE app_id = :app_id ORDER BY id DESC LIMIT {$limit}");
        $stmt->execute(['app_id' => $appId]);
        return array_map([$this, 'hydrate'], $stmt->fetchAll());
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM builds WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ? $this->hydrate($row) : null;
    }

    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['app_id'] = (int) $row['app_id'];
        return $row;
    }
}
