<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/email.php';
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

if ($email === '') {
    sendError('Email is required.', 400);
}

$statement = db()->prepare('SELECT id, email FROM users WHERE email = :email AND is_active = 1 LIMIT 1');
$statement->execute(['email' => $email]);
$user = $statement->fetch();

if (!$user) {
    sendSuccess([
        'message' => 'If that account exists, a password reset code will be sent shortly.',
    ]);
}

$pdo = db();
$resetCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$resetCodeHash = hash('sha256', $resetCode);
$expiresAt = (new DateTimeImmutable('+15 minutes'))->format('Y-m-d H:i:s');

$invalidateStatement = $pdo->prepare(
    'UPDATE password_resets
     SET used_at = NOW()
     WHERE user_id = :user_id AND used_at IS NULL'
);
$invalidateStatement->execute(['user_id' => (int) $user['id']]);

$insertStatement = $pdo->prepare(
    'INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES (:user_id, :code_hash, :expires_at)'
);
$insertStatement->execute([
    'user_id' => (int) $user['id'],
    'code_hash' => $resetCodeHash,
    'expires_at' => $expiresAt,
]);

$emailSent = sendPasswordResetEmail((string)$user['email'], $resetCode, $expiresAt);
if (!$emailSent && APP_ENV === 'production') {
    sendError('Password reset email could not be sent. Check the production email provider settings.', 503);
}

$response = [
    'email' => $user['email'],
    'expiresAt' => $expiresAt,
    'emailSent' => $emailSent,
    'message' => 'If that account exists, a password reset code will be sent shortly.',
];

if (APP_ENV !== 'production') {
    $response['resetCode'] = $resetCode;
}

sendSuccess($response);
