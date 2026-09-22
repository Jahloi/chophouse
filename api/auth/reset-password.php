<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/http.php';

requireMethod(['POST']);

db()->exec(
    'CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )'
);

$body = jsonBody();
$email = strtolower(trim((string)($body['email'] ?? '')));
$resetCode = trim((string)($body['resetCode'] ?? ''));
$newPassword = (string)($body['newPassword'] ?? '');

if ($email === '' || $resetCode === '' || $newPassword === '') {
    sendError('Email, reset code, and new password are required.', 400);
}

if (strlen($newPassword) < 6) {
    sendError('Use a password with at least 6 characters.', 400);
}

$pdo = db();
$statement = $pdo->prepare(
    'SELECT users.id AS user_id, password_resets.id AS reset_id, password_resets.code_hash AS code_hash,
            password_resets.expires_at AS expires_at
     FROM users
     INNER JOIN password_resets ON password_resets.user_id = users.id
     WHERE users.email = :email
       AND password_resets.used_at IS NULL
     ORDER BY password_resets.created_at DESC
     LIMIT 1'
);
$statement->execute(['email' => $email]);
$resetRequest = $statement->fetch();

if (!$resetRequest) {
    sendError('No active reset request was found for that email.', 404);
}

$expiryTimestamp = strtotime((string) $resetRequest['expires_at']);
if (!$expiryTimestamp || $expiryTimestamp < time()) {
    $expireStatement = $pdo->prepare(
        'UPDATE password_resets
         SET used_at = NOW()
         WHERE id = :id'
    );
    $expireStatement->execute(['id' => (int) $resetRequest['reset_id']]);
    sendError('That reset code has expired. Generate a new one and try again.', 400);
}

$providedCodeHash = hash('sha256', $resetCode);
if (!hash_equals((string) $resetRequest['code_hash'], $providedCodeHash)) {
    sendError('The reset code is invalid. Check the code and try again.', 400);
}

$passwordHash = hashUserPassword($newPassword);

$pdo->beginTransaction();

try {
    $updateUserStatement = $pdo->prepare(
        'UPDATE users
         SET password_hash = :password_hash, updated_at = NOW()
         WHERE id = :id'
    );
    $updateUserStatement->execute([
        'password_hash' => $passwordHash,
        'id' => (int) $resetRequest['user_id'],
    ]);

    $markUsedStatement = $pdo->prepare(
        'UPDATE password_resets
         SET used_at = NOW()
         WHERE id = :id'
    );
    $markUsedStatement->execute(['id' => (int) $resetRequest['reset_id']]);

    $clearSessionsStatement = $pdo->prepare(
        'DELETE FROM user_sessions WHERE user_id = :user_id'
    );
    $clearSessionsStatement->execute(['user_id' => (int) $resetRequest['user_id']]);

    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}

sendSuccess([
    'email' => $email,
    'message' => 'Your password was updated successfully. You can sign in with the new password now.',
]);
