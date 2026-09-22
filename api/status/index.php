<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/helpers.php';
require_once __DIR__ . '/../../lib/http.php';

$method = requireMethod(['GET', 'POST']);
$pdo = db();

function sensorColumnExists(string $columnName): bool
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

function ensureSensorSchema(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    if (!sensorColumnExists('sensor_id') && sensorColumnExists('device_code')) {
        db()->exec('ALTER TABLE sensor_statuses CHANGE device_code sensor_id VARCHAR(120) NOT NULL');
    }

    if (!sensorColumnExists('sensor_id')) {
        db()->exec('ALTER TABLE sensor_statuses ADD COLUMN sensor_id VARCHAR(120) NOT NULL UNIQUE AFTER id');
    }

    if (!sensorColumnExists('venue_id')) {
        db()->exec('ALTER TABLE sensor_statuses ADD COLUMN venue_id INT NULL AFTER sensor_id');
    }

    $checked = true;
}

ensureSensorSchema();

function sensorRequestApiKey(array $body): string
{
    $headerKey = $_SERVER['HTTP_X_SENSOR_KEY'] ?? '';
    return trim((string)($body['sensorApiKey'] ?? $body['sensorKey'] ?? $headerKey));
}

function authenticatedStatusUser(): ?array
{
    $token = bearerToken();
    if ($token === '') {
        return null;
    }

    $statement = db()->prepare(
        'SELECT users.id, users.role
         FROM user_sessions
         INNER JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token = :token
           AND users.is_active = 1
           AND user_sessions.expires_at > NOW()
         LIMIT 1'
    );
    $statement->execute(['token' => $token]);
    $user = $statement->fetch();

    if (!$user || !in_array($user['role'], ['ADMIN', 'STAFF'], true)) {
        return null;
    }

    return $user;
}

function requireStatusPostAuthorization(array $body): void
{
    if (authenticatedStatusUser()) {
        return;
    }

    $configuredKey = trim((string)SENSOR_API_KEY);
    if ($configuredKey === '') {
        if (APP_ENV === 'production') {
            sendError('Sensor API key is not configured on the server.', 503);
        }

        return;
    }

    if (!hash_equals($configuredKey, sensorRequestApiKey($body))) {
        sendError('Valid sensor API key required.', 401);
    }
}

function ensureStatusVenueSchema(): void
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

if ($method === 'GET') {
    $requestedSensorId = trim((string)($_GET['sensorId'] ?? $_GET['deviceId'] ?? ''));
    $statement = $requestedSensorId !== ''
        ? $pdo->prepare(
            'SELECT sensor_id AS sensorId, venue_id AS venueId, label, location, status, status_label AS statusLabel,
                    sensor_online AS sensorOnline, network_mode AS networkMode,
                    ip_address AS ipAddress, last_seen_ms AS lastSeenMs
             FROM sensor_statuses
             WHERE sensor_id = :sensor_id
             LIMIT 1'
        )
        : $pdo->prepare(
            'SELECT sensor_id AS sensorId, venue_id AS venueId, label, location, status, status_label AS statusLabel,
                    sensor_online AS sensorOnline, network_mode AS networkMode,
                    ip_address AS ipAddress, last_seen_ms AS lastSeenMs
             FROM sensor_statuses
             ORDER BY updated_at DESC, id DESC
             LIMIT 1'
        );
    if ($requestedSensorId !== '') {
        $statement->execute(['sensor_id' => $requestedSensorId]);
    } else {
        $statement->execute();
    }
    $row = $statement->fetch();

    if (!$row) {
        $row = [
            'sensorId' => $requestedSensorId,
            'venueId' => null,
            'label' => 'KTV Room 1',
            'location' => 'Floor 2 - VIP Wing',
            'status' => 'available',
            'statusLabel' => 'Available',
            'sensorOnline' => 0,
            'networkMode' => 'offline',
            'ipAddress' => '0.0.0.0',
            'lastSeenMs' => 0,
        ];
    }

    sendSuccess([
        'sensorId' => $row['sensorId'],
        'deviceId' => $row['sensorId'],
        'venueId' => $row['venueId'] === null ? null : (int)$row['venueId'],
        'label' => $row['label'],
        'location' => $row['location'],
        'status' => $row['status'],
        'statusLabel' => $row['statusLabel'],
        'sensorOnline' => (bool)$row['sensorOnline'],
        'networkMode' => $row['networkMode'],
        'ipAddress' => $row['ipAddress'],
        'lastSeenMs' => (int)$row['lastSeenMs'],
    ]);
}

$body = jsonBody();
$sensorId = trim((string)($body['sensorId'] ?? $body['deviceId'] ?? ''));

if ($sensorId === '') {
    sendError('Sensor ID is required.', 422);
}

requireStatusPostAuthorization($body);

$venueId = (int)($body['venueId'] ?? 0);
$existingSensorStatement = $pdo->prepare(
    'SELECT venue_id AS venueId, label, location
     FROM sensor_statuses
     WHERE sensor_id = :sensor_id
     LIMIT 1'
);
$existingSensorStatement->execute(['sensor_id' => $sensorId]);
$existingSensor = $existingSensorStatement->fetch() ?: [];
$venueId = $venueId > 0 ? $venueId : (int)($existingSensor['venueId'] ?? 0);
$venueName = trim((string)($body['venueName'] ?? $body['label'] ?? $existingSensor['label'] ?? 'KTV Room 1'));
$location = trim((string)($body['location'] ?? $existingSensor['location'] ?? 'Floor 2 - VIP Wing'));
$status = strtolower(trim((string)($body['status'] ?? 'available')));
$statusLabel = trim((string)($body['statusLabel'] ?? ($status === 'occupied' ? 'Occupied' : 'Available')));
ensureStatusVenueSchema();

$statement = $pdo->prepare(
    'INSERT INTO sensor_statuses
        (sensor_id, venue_id, label, location, status, status_label, sensor_online, network_mode, ip_address, last_seen_ms)
     VALUES
        (:sensor_id, :venue_id, :label, :location, :status, :status_label, :sensor_online, :network_mode, :ip_address, :last_seen_ms)
     ON DUPLICATE KEY UPDATE
        venue_id = COALESCE(VALUES(venue_id), venue_id),
        label = VALUES(label),
        location = VALUES(location),
        status = VALUES(status),
        status_label = VALUES(status_label),
        sensor_online = VALUES(sensor_online),
        network_mode = VALUES(network_mode),
        ip_address = VALUES(ip_address),
        last_seen_ms = VALUES(last_seen_ms),
        updated_at = NOW()'
);
$statement->execute([
    'sensor_id' => $sensorId,
    'venue_id' => $venueId > 0 ? $venueId : null,
    'label' => $venueName,
    'location' => $location,
    'status' => $status,
    'status_label' => $statusLabel,
    'sensor_online' => !empty($body['sensorOnline']) ? 1 : 0,
    'network_mode' => (string)($body['networkMode'] ?? 'offline'),
    'ip_address' => (string)($body['ipAddress'] ?? '0.0.0.0'),
    'last_seen_ms' => (int)($body['lastSeenMs'] ?? 0),
]);

if ($venueId > 0) {
    $venueUpdateStatement = $pdo->prepare(
        'UPDATE venues
         SET status = :status, updated_at = NOW()
         WHERE id = :id
         LIMIT 1'
    );
    $venueUpdateStatement->execute([
        'status' => normalizeVenueStatus($status),
        'id' => $venueId,
    ]);
} else {
    $venueUpdateStatement = $pdo->prepare(
        'UPDATE venues
         SET status = :status, updated_at = NOW()
         WHERE name = :name
         LIMIT 1'
    );
    $venueUpdateStatement->execute([
        'status' => normalizeVenueStatus($status),
        'name' => $venueName,
    ]);
}

sendSuccess([
    'updated' => true,
    'sensorId' => $sensorId,
    'deviceId' => $sensorId,
    'venueId' => $venueId > 0 ? $venueId : null,
    'venueName' => $venueName,
], 201);
