<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/http.php';

requireMethod(['POST']);

$body = jsonBody();
$email = strtolower(trim((string)($body['email'] ?? '')));
$password = (string)($body['password'] ?? '');

if ($email === '' || $password === '') {
    sendError('Email and password are required.', 400);
}

ensureUserAuthSchema();

$statement = db()->prepare('SELECT id, name, email, password_hash, role, is_active AS isActive FROM users WHERE email = :email LIMIT 1');
$statement->execute(['email' => $email]);
$user = $statement->fetch();

if (!$user) {
    sendError('Invalid email or password.', 401);
}

if ((int)($user['isActive'] ?? 1) !== 1) {
    sendError('This account has been deactivated.', 403);
}

$passwordHash = (string)($user['password_hash'] ?? '');
if (!verifyUserPassword($password, $passwordHash)) {
    sendError('Invalid email or password.', 401);
}

if (shouldRehashUserPassword($passwordHash)) {
    $updateStatement = db()->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
    $updateStatement->execute([
        'password_hash' => hashUserPassword($password),
        'id' => (int)$user['id'],
    ]);
}

$token = issueSessionToken((int)$user['id']);

sendSuccess([
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => strtoupper($user['role']),
    ],
]);
