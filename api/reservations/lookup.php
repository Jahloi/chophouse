<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['GET']);

$email = trim((string)($_GET['email'] ?? ''));
$reservationId = (int)($_GET['reservationId'] ?? $_GET['id'] ?? 0);
$reference = trim((string)($_GET['reference'] ?? ''));

if ($email === '' || ($reservationId <= 0 && $reference === '')) {
    sendError('Enter your email and reservation ID or GCash reference number.', 400);
}

ensureReservationDownpaymentColumns();
ensureReservationStatusSchema();

$sql = 'SELECT reservations.id, reservations.customer_name AS customerName,
               reservations.customer_email AS customerEmail, reservations.customer_phone AS customerPhone,
               reservations.reservation_date AS reservationDate,
               reservations.scheduled_time AS scheduledTime, reservations.start_time AS startTime,
               reservations.end_time AS endTime, reservations.guest_count AS guestCount,
               reservations.downpayment_amount AS downpaymentAmount,
               reservations.downpayment_method AS downpaymentMethod,
               reservations.downpayment_reference AS downpaymentReference,
               reservations.downpayment_status AS downpaymentStatus,
               reservations.status, reservations.created_at AS createdAt, reservations.updated_at AS updatedAt,
               venues.id AS venue_id, venues.name AS venue_name, venues.venue_type AS venue_type
        FROM reservations
        INNER JOIN venues ON venues.id = reservations.venue_id
        WHERE LOWER(reservations.customer_email) = LOWER(:email)';

$params = ['email' => $email];

if ($reservationId > 0) {
    $sql .= ' AND reservations.id = :reservation_id';
    $params['reservation_id'] = $reservationId;
} else {
    $sql .= ' AND reservations.downpayment_reference = :reference';
    $params['reference'] = $reference;
}

$sql .= ' LIMIT 1';

$statement = db()->prepare($sql);
$statement->execute($params);
$row = $statement->fetch();

if (!$row) {
    sendError('No reservation matched those details.', 404);
}

sendSuccess([
    'id' => (int)$row['id'],
    'customerName' => $row['customerName'],
    'customerEmail' => $row['customerEmail'],
    'customerPhone' => $row['customerPhone'],
    'reservationDate' => $row['reservationDate'],
    'scheduledTime' => $row['scheduledTime'],
    'startTime' => $row['startTime'],
    'endTime' => $row['endTime'],
    'guestCount' => (int)$row['guestCount'],
    'downpaymentAmount' => $row['downpaymentAmount'] === null ? null : (float)$row['downpaymentAmount'],
    'downpaymentMethod' => $row['downpaymentMethod'],
    'downpaymentReference' => $row['downpaymentReference'],
    'downpaymentStatus' => $row['downpaymentStatus'],
    'status' => $row['status'],
    'createdAt' => $row['createdAt'],
    'updatedAt' => $row['updatedAt'],
    'venue' => [
        'id' => (int)$row['venue_id'],
        'name' => $row['venue_name'],
        'venueType' => $row['venue_type'],
    ],
]);
