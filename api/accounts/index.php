<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';

$method = requireMethod(['GET', 'PATCH']);

$currentUser = requireRole(['ADMIN']);

function fetchAccountById(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT id, name, email, role, is_active AS isActive,
                created_at AS createdAt, updated_at AS updatedAt
         FROM users
         WHERE id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $account = $statement->fetch();

    if (!$account) {
        return null;
    }

    return [
        'id' => (int)$account['id'],
        'name' => $account['name'],
        'email' => $account['email'],
        'role' => $account['role'],
        'isActive' => (int)$account['isActive'] === 1,
        'canToggleStatus' => (int)$account['id'] !== (int)$GLOBALS['currentUser']['id'],
        'canDeactivate' => (int)$account['id'] !== (int)$GLOBALS['currentUser']['id']
            && (int)$account['isActive'] === 1,
        'createdAt' => $account['createdAt'],
        'updatedAt' => $account['updatedAt'],
    ];
}

if ($method === 'PATCH') {
    $id = (int)($_GET['id'] ?? 0);
    $body = jsonBody();
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($id <= 0) {
        sendError('A valid account id is required.', 400);
    }

    if (!in_array($action, ['activate', 'deactivate'], true)) {
        sendError('Account action must be activate or deactivate.', 400);
    }

    if ($id === (int)$currentUser['id'] && $action === 'deactivate') {
        sendError('You cannot deactivate the account you are currently using.', 403);
    }

    $account = fetchAccountById($id);
    if (!$account) {
        sendError('Account not found.', 404);
    }

    $nextStatus = $action === 'activate' ? 1 : 0;
    db()->prepare('UPDATE users SET is_active = :is_active, updated_at = NOW() WHERE id = :id')
        ->execute([
            'id' => $id,
            'is_active' => $nextStatus,
        ]);

    if ($action === 'deactivate') {
        db()->prepare('DELETE FROM user_sessions WHERE user_id = :id')
            ->execute(['id' => $id]);
    }

    sendSuccess(fetchAccountById($id));
}

$statement = db()->query(
    'SELECT id, name, email, role, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM users
     ORDER BY FIELD(role, "ADMIN", "STAFF"), name ASC, email ASC'
);

$rows = array_map(static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'isActive' => (int)$row['isActive'] === 1,
        'canToggleStatus' => (int)$row['id'] !== (int)$GLOBALS['currentUser']['id'],
        'canDeactivate' => (int)$row['id'] !== (int)$GLOBALS['currentUser']['id']
            && (int)$row['isActive'] === 1,
        'createdAt' => $row['createdAt'],
        'updatedAt' => $row['updatedAt'],
    ];
}, $statement->fetchAll());

sendSuccess($rows);
