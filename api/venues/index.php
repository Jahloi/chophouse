<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/helpers.php';
require_once __DIR__ . '/../../lib/http.php';

$method = requireMethod(['GET', 'POST', 'PATCH', 'DELETE']);

function ensureVenueStatusSchema(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    db()->exec(
        'ALTER TABLE venues
         MODIFY status ENUM("AVAILABLE", "OCCUPIED", "RESERVED", "STANDBY", "MAINTENANCE")
         NOT NULL DEFAULT "AVAILABLE"'
    );

    $checked = true;
}

function venueSensorColumnExists(string $columnName): bool
{
    $statement = db()->prepare(
        'SELECT COUNT(*) AS column_count
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "sensor_statuses"
           AND COLUMN_NAME = :column_name'
    );
    $statement->execute(['column_name' => $columnName]);

    return (int)($statement->fetch()['column_count'] ?? 0) > 0;
}

function ensureVenueSensorSchema(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    if (!venueSensorColumnExists('sensor_id') && venueSensorColumnExists('device_code')) {
        db()->exec('ALTER TABLE sensor_statuses CHANGE device_code sensor_id VARCHAR(120) NOT NULL');
    }

    if (!venueSensorColumnExists('sensor_id')) {
        db()->exec('ALTER TABLE sensor_statuses ADD COLUMN sensor_id VARCHAR(120) NOT NULL UNIQUE AFTER id');
    }

    if (!venueSensorColumnExists('venue_id')) {
        db()->exec('ALTER TABLE sensor_statuses ADD COLUMN venue_id INT NULL AFTER sensor_id');
    }

    $checked = true;
}

if ($method === 'GET') {
    ensureVenueStatusSchema();
    ensureVenueSensorSchema();

    $rows = db()->query(
        'SELECT id, name, venue_type AS venueType, capacity_min AS capacityMin, capacity_max AS capacityMax,
                notes, status,
                (
                    SELECT sensor_id
                    FROM sensor_statuses
                    WHERE sensor_statuses.venue_id = venues.id
                    ORDER BY sensor_statuses.updated_at DESC, sensor_statuses.id DESC
                    LIMIT 1
                ) AS sensorId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM venues
         ORDER BY venue_type ASC, name ASC'
    )->fetchAll();

    sendSuccess($rows);
}

$body = jsonBody();
$pdo = db();
ensureVenueStatusSchema();

if ($method === 'POST') {
    requireRole(['ADMIN']);

    $name = trim((string)($body['name'] ?? ''));
    $venueType = normalizeVenueType((string)($body['venueType'] ?? 'VIP_LOUNGE'));
    $capacityMin = isset($body['capacityMin']) ? (int)$body['capacityMin'] : null;
    $capacityMax = isset($body['capacityMax']) ? (int)$body['capacityMax'] : null;
    $notes = trim((string)($body['notes'] ?? ''));
    $status = normalizeVenueStatus((string)($body['status'] ?? 'AVAILABLE'));

    if ($name === '') {
        sendError('Venue name is required.', 400);
    }

    $statement = $pdo->prepare(
        'INSERT INTO venues (name, venue_type, capacity_min, capacity_max, notes, status)
         VALUES (:name, :venue_type, :capacity_min, :capacity_max, :notes, :status)'
    );
    $statement->execute([
        'name' => $name,
        'venue_type' => $venueType,
        'capacity_min' => $capacityMin,
        'capacity_max' => $capacityMax,
        'notes' => $notes === '' ? null : $notes,
        'status' => $status,
    ]);

    $id = (int)$pdo->lastInsertId();
    $result = $pdo->query(
        'SELECT id, name, venue_type AS venueType, capacity_min AS capacityMin, capacity_max AS capacityMax,
                notes, status, created_at AS createdAt, updated_at AS updatedAt
         FROM venues
         WHERE id = ' . $id
    )->fetch();

    sendSuccess($result, 201);
}

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    sendError('A valid venue id is required.', 400);
}

if ($method === 'PATCH') {
    $requestedFields = array_intersect(
        array_keys($body),
        ['name', 'capacityMin', 'capacityMax', 'notes', 'status']
    );

    if (!$requestedFields) {
        sendError('No update fields were provided.', 400);
    }

    $inventoryFields = array_diff($requestedFields, ['status']);
    requireRole($inventoryFields ? ['ADMIN'] : ['ADMIN', 'STAFF']);

    $fields = [];
    $params = ['id' => $id];

    foreach ([
        'name' => 'name',
        'capacityMin' => 'capacity_min',
        'capacityMax' => 'capacity_max',
        'notes' => 'notes',
    ] as $source => $column) {
        if (array_key_exists($source, $body)) {
            $fields[] = sprintf('%s = :%s', $column, $source);
            $params[$source] = $body[$source];
        }
    }

    if (array_key_exists('status', $body)) {
        $fields[] = 'status = :status';
        $params['status'] = normalizeVenueStatus((string)$body['status']);
    }

    $statement = $pdo->prepare(
        'UPDATE venues SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = :id'
    );
    $statement->execute($params);

    $result = $pdo->query(
        'SELECT id, name, venue_type AS venueType, capacity_min AS capacityMin, capacity_max AS capacityMax,
                notes, status, created_at AS createdAt, updated_at AS updatedAt
         FROM venues
         WHERE id = ' . $id
    )->fetch();

    sendSuccess($result);
}

$user = requireRole(['ADMIN']);
$statement = $pdo->prepare('DELETE FROM venues WHERE id = :id');
$statement->execute(['id' => $id]);

sendSuccess([
    'id' => $id,
    'deletedByUserId' => (int)$user['id'],
]);
