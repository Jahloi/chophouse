<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

function ensureUsersActiveColumn(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    $statement = db()->prepare(
        'SELECT COUNT(*) AS column_count
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "users"
           AND COLUMN_NAME = "is_active"'
    );
    $statement->execute();

    if ((int)($statement->fetch()['column_count'] ?? 0) === 0) {
        db()->exec('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
    }

    $checked = true;
}

function ensureUserPasswordHashColumn(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    $statement = db()->prepare(
        'SELECT CHARACTER_MAXIMUM_LENGTH AS max_length
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "users"
           AND COLUMN_NAME = "password_hash"
         LIMIT 1'
    );
    $statement->execute();
    $column = $statement->fetch();

    if (!$column || (int)($column['max_length'] ?? 0) < 255) {
        db()->exec('ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL');
    }

    $checked = true;
}

function ensureUserAuthSchema(): void
{
    ensureUsersActiveColumn();
    ensureUserPasswordHashColumn();
}

function hashUserPassword(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function verifyUserPassword(string $password, string $storedHash): bool
{
    if ($storedHash === '') {
        return false;
    }

    if (!empty(password_get_info($storedHash)['algo'])) {
        return password_verify($password, $storedHash);
    }

    return hash_equals($storedHash, hash('sha256', $password))
        || hash_equals($storedHash, $password);
}

function shouldRehashUserPassword(string $storedHash): bool
{
    return empty(password_get_info($storedHash)['algo'])
        || password_needs_rehash($storedHash, PASSWORD_DEFAULT);
}

function issueSessionToken(int $userId): string
{
    $token = bin2hex(random_bytes(24));
    $expiresAt = (new DateTimeImmutable('+' . SESSION_DURATION_HOURS . ' hours'))->format('Y-m-d H:i:s');

    $statement = db()->prepare(
        'INSERT INTO user_sessions (user_id, token, expires_at) VALUES (:user_id, :token, :expires_at)'
    );
    $statement->execute([
        'user_id' => $userId,
        'token' => $token,
        'expires_at' => $expiresAt,
    ]);

    return $token;
}

function bearerToken(): string
{
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
    ];

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            $candidates[] = $headers['Authorization'] ?? '';
            $candidates[] = $headers['authorization'] ?? '';
        }
    }

    foreach ($candidates as $header) {
        if (is_string($header) && stripos($header, 'Bearer ') === 0) {
            return trim(substr($header, 7));
        }
    }

    return '';
}

function requireAuth(): array
{
    ensureUserAuthSchema();

    $token = bearerToken();
    if ($token === '') {
        sendError('Authentication required.', 401);
    }

    $statement = db()->prepare(
        'SELECT users.id, users.name, users.email, users.role
         FROM user_sessions
         INNER JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token = :token
           AND users.is_active = 1
           AND user_sessions.expires_at > NOW()
         LIMIT 1'
    );
    $statement->execute(['token' => $token]);
    $user = $statement->fetch();

    if (!$user) {
      sendError('Invalid or expired token.', 401);
    }

    return $user;
}

function requireRole(array $roles): array
{
    $user = requireAuth();
    if (!in_array($user['role'], $roles, true)) {
        sendError('You do not have permission to perform this action.', 403);
    }

    return $user;
}
