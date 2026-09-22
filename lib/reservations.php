<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/http.php';

function ensureReservationActivityLogsTable(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS reservation_activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reservation_id INT NOT NULL,
            action_type VARCHAR(40) NOT NULL,
            details VARCHAR(255) NULL,
            changed_by_user_id INT NULL,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_activity_logs_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
            CONSTRAINT fk_activity_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )'
    );

    $checked = true;
}

function ensureReservationStatusSchema(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS reservation_status_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reservation_id INT NOT NULL,
            old_status ENUM("PENDING", "APPROVED", "CANCELLED") NULL,
            new_status ENUM("PENDING", "APPROVED", "CANCELLED") NOT NULL,
            changed_by_user_id INT NULL,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_status_logs_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
            CONSTRAINT fk_status_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )'
    );

    $statusEnum = 'ENUM("PENDING", "APPROVED", "CANCELLED", "CHECKED_IN", "CHECKED_OUT", "LATE", "NO_SHOW")';
    db()->exec('ALTER TABLE reservations MODIFY status ' . $statusEnum . ' NOT NULL DEFAULT "PENDING"');
    db()->exec('ALTER TABLE reservation_status_logs MODIFY old_status ' . $statusEnum . ' NULL');
    db()->exec('ALTER TABLE reservation_status_logs MODIFY new_status ' . $statusEnum . ' NOT NULL');

    $checked = true;
}

function logReservationActivity(
    int $reservationId,
    string $actionType,
    ?int $changedByUserId = null,
    ?string $details = null
): void {
    ensureReservationActivityLogsTable();

    $statement = db()->prepare(
        'INSERT INTO reservation_activity_logs (reservation_id, action_type, details, changed_by_user_id)
         VALUES (:reservation_id, :action_type, :details, :changed_by_user_id)'
    );
    $statement->execute([
        'reservation_id' => $reservationId,
        'action_type' => $actionType,
        'details' => $details,
        'changed_by_user_id' => $changedByUserId,
    ]);
}

function ensureReservationDownpaymentColumns(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    $columns = [
        'downpayment_amount' => 'ALTER TABLE reservations ADD COLUMN downpayment_amount DECIMAL(10,2) NULL AFTER guest_count',
        'downpayment_method' => 'ALTER TABLE reservations ADD COLUMN downpayment_method VARCHAR(60) NULL AFTER downpayment_amount',
        'downpayment_reference' => 'ALTER TABLE reservations ADD COLUMN downpayment_reference VARCHAR(120) NULL AFTER downpayment_method',
        'downpayment_receipt_path' => 'ALTER TABLE reservations ADD COLUMN downpayment_receipt_path VARCHAR(255) NULL AFTER downpayment_reference',
        'id_verification_path' => 'ALTER TABLE reservations ADD COLUMN id_verification_path VARCHAR(255) NULL AFTER downpayment_receipt_path',
        'downpayment_status' => 'ALTER TABLE reservations ADD COLUMN downpayment_status VARCHAR(40) NOT NULL DEFAULT "UNPAID" AFTER id_verification_path',
    ];

    foreach ($columns as $columnName => $alterSql) {
        $statement = db()->prepare(
            'SELECT COUNT(*) AS column_count
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = "reservations"
               AND COLUMN_NAME = :column_name'
        );
        $statement->execute(['column_name' => $columnName]);

        if ((int)($statement->fetch()['column_count'] ?? 0) === 0) {
            db()->exec($alterSql);
        }
    }

    $checked = true;
}

function fetchReservationById(int $id): ?array
{
    ensureReservationStatusSchema();
    ensureReservationDownpaymentColumns();

    $statement = db()->prepare(
        'SELECT reservations.id, reservations.customer_name AS customerName,
                reservations.customer_email AS customerEmail, reservations.customer_phone AS customerPhone,
                reservations.venue_id AS venueId, reservations.reservation_date AS reservationDate,
                reservations.scheduled_time AS scheduledTime, reservations.start_time AS startTime,
                reservations.end_time AS endTime, reservations.guest_count AS guestCount,
                reservations.downpayment_amount AS downpaymentAmount,
                reservations.downpayment_method AS downpaymentMethod,
                reservations.downpayment_reference AS downpaymentReference,
                reservations.downpayment_receipt_path AS downpaymentReceiptPath,
                reservations.id_verification_path AS idVerificationPath,
                reservations.downpayment_status AS downpaymentStatus,
                reservations.status, reservations.created_at AS createdAt, reservations.updated_at AS updatedAt,
                venues.id AS venue_id, venues.name AS venue_name, venues.venue_type AS venue_type
         FROM reservations
         INNER JOIN venues ON venues.id = reservations.venue_id
         WHERE reservations.id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $row = $statement->fetch();

    if (!$row) {
        return null;
    }

    return [
        'id' => (int)$row['id'],
        'customerName' => $row['customerName'],
        'customerEmail' => $row['customerEmail'],
        'customerPhone' => $row['customerPhone'],
        'venueId' => (int)$row['venueId'],
        'reservationDate' => $row['reservationDate'],
        'scheduledTime' => $row['scheduledTime'],
        'startTime' => $row['startTime'],
        'endTime' => $row['endTime'],
        'guestCount' => (int)$row['guestCount'],
        'downpaymentAmount' => $row['downpaymentAmount'] === null ? null : (float)$row['downpaymentAmount'],
        'downpaymentMethod' => $row['downpaymentMethod'],
        'downpaymentReference' => $row['downpaymentReference'],
        'downpaymentReceiptPath' => $row['downpaymentReceiptPath'],
        'idVerificationPath' => $row['idVerificationPath'],
        'downpaymentStatus' => $row['downpaymentStatus'],
        'status' => $row['status'],
        'createdAt' => $row['createdAt'],
        'updatedAt' => $row['updatedAt'],
        'venue' => [
            'id' => (int)$row['venue_id'],
            'name' => $row['venue_name'],
            'venueType' => $row['venue_type'],
        ],
    ];
}

function assertVenueExists(int $venueId): array
{
    $statement = db()->prepare(
        'SELECT id, name, venue_type AS venueType, status FROM venues WHERE id = :id LIMIT 1'
    );
    $statement->execute(['id' => $venueId]);
    $venue = $statement->fetch();

    if (!$venue) {
        sendError('Venue not found.', 404);
    }

    return $venue;
}

function assertVenueNotOccupied(array $venue, ?array $existingReservation = null): void
{
    $venueStatus = strtoupper((string)($venue['status'] ?? 'AVAILABLE'));
    if ($venueStatus !== 'OCCUPIED') {
        return;
    }

    $sameApprovedReservation =
        $existingReservation &&
        in_array(strtoupper((string)($existingReservation['status'] ?? '')), ['APPROVED', 'CHECKED_IN', 'LATE'], true) &&
        (int)($existingReservation['venueId'] ?? 0) === (int)($venue['id'] ?? 0);

    if ($sameApprovedReservation) {
        return;
    }

    sendError(
        $venue['venueType'] === 'ROOM'
            ? 'That KTV room is already occupied and cannot accept another active reservation yet.'
            : 'That VIP lounge is already occupied and cannot accept another active reservation yet.',
        409
    );
}

function assertNoApprovedConflict(array $venue, string $reservationDate, array $candidate, ?int $excludeId = null): void
{
    ensureReservationStatusSchema();

    $statement = db()->prepare(
        'SELECT scheduled_time AS scheduledTime, start_time AS startTime, end_time AS endTime
         FROM reservations
         WHERE venue_id = :venue_id
           AND reservation_date = :reservation_date
           AND status IN ("APPROVED", "CHECKED_IN", "LATE")
           ' . ($excludeId ? 'AND id <> :exclude_id' : '')
    );

    $params = [
        'venue_id' => (int)$venue['id'],
        'reservation_date' => $reservationDate,
    ];

    if ($excludeId) {
        $params['exclude_id'] = $excludeId;
    }

    $statement->execute($params);

    foreach ($statement->fetchAll() as $existing) {
        if (reservationSchedulesConflict($venue['venueType'], $candidate, $existing)) {
            sendError(
                $venue['venueType'] === 'ROOM'
                    ? 'That KTV room already has an active reservation in the selected time range.'
                    : 'That VIP lounge already has an active reservation for the selected date.',
                409
            );
        }
    }
}

function normalizeSchedule(array $venue, array $body): array
{
    if ($venue['venueType'] === 'ROOM') {
        $startTime = (string)($body['startTime'] ?? '');
        $endTime = (string)($body['endTime'] ?? '');
        if (!isValidRoomRange($startTime, $endTime)) {
            sendError('KTV room reservations require a valid start and end time.', 400);
        }

        return [
            'scheduledTime' => null,
            'startTime' => $startTime,
            'endTime' => $endTime,
        ];
    }

    $scheduledTime = (string)($body['scheduledTime'] ?? '');
    if (parseTimeToMinutes($scheduledTime) < 0) {
        sendError('VIP lounge reservations require scheduledTime.', 400);
    }

    return [
        'scheduledTime' => $scheduledTime,
        'startTime' => null,
        'endTime' => null,
    ];
}
