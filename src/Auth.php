<?php

declare(strict_types=1);

namespace QuantumBuilder;

use PDO;

final class Auth
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function bootstrapSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        session_name('quantum_builder_session');
        session_set_cookie_params([
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Strict',
            'path' => '/',
        ]);
        session_start();

        if (!isset($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
        }
    }

    public function createAdmin(string $email, string $password): void
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid admin email address.');
        }
        if (strlen($password) < 12) {
            throw new \InvalidArgumentException('Admin password must contain at least 12 characters.');
        }

        $stmt = $this->pdo->prepare('SELECT id FROM users WHERE email = :email');
        $stmt->execute(['email' => $email]);
        if ($stmt->fetchColumn()) {
            return;
        }

        $stmt = $this->pdo->prepare('INSERT INTO users (email, password_hash) VALUES (:email, :hash)');
        $stmt->execute([
            'email' => $email,
            'hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    }

    public function login(string $email, string $password): bool
    {
        $stmt = $this->pdo->prepare('SELECT id, email, password_hash FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => strtolower(trim($email))]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, (string) $user['password_hash'])) {
            return false;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['user_email'] = (string) $user['email'];
        $_SESSION['csrf'] = bin2hex(random_bytes(24));

        $update = $this->pdo->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id');
        $update->execute(['id' => (int) $user['id']]);
        return true;
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
    }

    public function isLoggedIn(): bool
    {
        return isset($_SESSION['user_id']) && (int) $_SESSION['user_id'] > 0;
    }

    public function requireLogin(): void
    {
        if (!$this->isLoggedIn()) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'error' => 'authentication_required']);
            exit;
        }
    }

    public function csrf(): string
    {
        return (string) ($_SESSION['csrf'] ?? '');
    }

    public function verifyCsrf(?string $token): void
    {
        if (!$token || !hash_equals($this->csrf(), $token)) {
            http_response_code(419);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'error' => 'csrf_failed']);
            exit;
        }
    }
}
