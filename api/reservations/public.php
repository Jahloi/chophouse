<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['GET']);
ensureReservationStatusSchema();

$statement = db()->query(
    'SELECT reservations.id, reservations.reservation_date AS reservationDate,
            reservations.scheduled_time AS scheduledTime, reservations.start_time AS startTime,
            reservations.end_time AS endTime, reservations.status,
            venues.id AS venue_id, venues.name AS venue_name, venues.venue_type AS venue_type
     FROM reservations
     INNER JOIN venues ON venues.id = reservations.venue_id
     WHERE reservations.status IN ("APPROVED", "CHECKED_IN", "LATE")
     ORDER BY reservations.reservation_date ASC, reservations.created_at DESC'
);

$rows = array_map(static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'reservationDate' => $row['reservationDate'],
        'scheduledTime' => $row['scheduledTime'],
        'startTime' => $row['startTime'],
        'endTime' => $row['endTime'],
        'status' => $row['status'],
        'venue' => [
            'id' => (int)$row['venue_id'],
            'name' => $row['venue_name'],
            'venueType' => $row['venue_type'],
        ],
    ];
}, $statement->fetchAll());

sendSuccess($rows);
