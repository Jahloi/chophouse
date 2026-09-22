<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/email.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';
require_once __DIR__ . '/../../lib/uploads.php';

$method = requireMethod(['GET', 'POST', 'PATCH']);
$pdo = db();
ensureReservationStatusSchema();
ensureReservationDownpaymentColumns();

function requestBody(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'multipart/form-data') !== false) {
        return $_POST;
    }

    return jsonBody();
}

function uploadReservationDocument(array $file, string $prefix): string
{
    return storeUploadedFile(
        $file,
        [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
        ],
        5 * 1024 * 1024,
        'reservations',
        $prefix,
        'Upload the required receipt and ID verification files.',
        'Uploaded files must be JPG, PNG, WEBP, or PDF.',
        'Uploaded files must be 5MB or smaller.',
        'Unable to prepare reservation upload folder.',
        'Unable to save uploaded reservation file.'
    );
}

if ($method === 'GET') {
    requireRole(['ADMIN', 'STAFF']);
    $statement = $pdo->query(
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
         ORDER BY FIELD(reservations.status, "PENDING", "APPROVED", "LATE", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW", "CANCELLED"),
                  reservations.reservation_date ASC,
                  reservations.created_at DESC'
    );

    $rows = array_map(static function (array $row): array {
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
    }, $statement->fetchAll());

    sendSuccess($rows);
}

$body = requestBody();

if ($method === 'POST') {
    $customerName = trim((string)($body['customerName'] ?? ''));
    $customerEmail = trim((string)($body['customerEmail'] ?? ''));
    $customerPhone = trim((string)($body['customerPhone'] ?? ''));
    $venueId = (int)($body['venueId'] ?? 0);
    $reservationDate = trim((string)($body['reservationDate'] ?? ''));
    $guestCount = (int)($body['guestCount'] ?? 0);
    $downpaymentAmount = array_key_exists('downpaymentAmount', $body) ? (float)$body['downpaymentAmount'] : null;
    $downpaymentMethod = trim((string)($body['downpaymentMethod'] ?? ''));
    $downpaymentReference = trim((string)($body['downpaymentReference'] ?? ''));
    $downpaymentRequired = (bool)($body['downpaymentRequired'] ?? false);

    if ($customerName === '' || $customerEmail === '' || $customerPhone === '' || $venueId <= 0 || $reservationDate === '' || $guestCount <= 0) {
        sendError('Missing reservation details.', 400);
    }

    if ($downpaymentRequired && (!$downpaymentAmount || $downpaymentAmount <= 0 || $downpaymentMethod !== 'GCash')) {
        sendError('Downpayment details are required before submitting this reservation.', 400);
    }

    $downpaymentReceiptPath = null;
    $idVerificationPath = null;
    if ($downpaymentRequired) {
        $downpaymentReceiptPath = uploadReservationDocument($_FILES['downpaymentReceipt'] ?? [], 'receipt');
        $idVerificationPath = uploadReservationDocument($_FILES['idVerification'] ?? [], 'id');
    }

    $venue = assertVenueExists($venueId);
    $schedule = normalizeSchedule($venue, $body);
    assertNoApprovedConflict($venue, $reservationDate, $schedule);

    $statement = $pdo->prepare(
        'INSERT INTO reservations
            (customer_name, customer_email, customer_phone, venue_id, reservation_date,
             scheduled_time, start_time, end_time, guest_count,
             downpayment_amount, downpayment_method, downpayment_reference,
             downpayment_receipt_path, id_verification_path, downpayment_status, status)
         VALUES
            (:customer_name, :customer_email, :customer_phone, :venue_id, :reservation_date,
             :scheduled_time, :start_time, :end_time, :guest_count,
             :downpayment_amount, :downpayment_method, :downpayment_reference,
             :downpayment_receipt_path, :id_verification_path, :downpayment_status, "PENDING")'
    );
    $statement->execute([
        'customer_name' => $customerName,
        'customer_email' => $customerEmail,
        'customer_phone' => $customerPhone,
        'venue_id' => $venueId,
        'reservation_date' => $reservationDate,
        'scheduled_time' => $schedule['scheduledTime'],
        'start_time' => $schedule['startTime'],
        'end_time' => $schedule['endTime'],
        'guest_count' => $guestCount,
        'downpayment_amount' => $downpaymentAmount,
        'downpayment_method' => $downpaymentMethod === '' ? null : $downpaymentMethod,
        'downpayment_reference' => $downpaymentReference === '' ? null : $downpaymentReference,
        'downpayment_receipt_path' => $downpaymentReceiptPath,
        'id_verification_path' => $idVerificationPath,
        'downpayment_status' => $downpaymentReceiptPath === null ? 'UNPAID' : 'PENDING',
    ]);

    $createdReservationId = (int)$pdo->lastInsertId();
    if ($downpaymentRequired && $downpaymentReceiptPath !== null) {
        $venueStatement = $pdo->prepare(
            'UPDATE venues SET status = "STANDBY", updated_at = NOW()
             WHERE id = :venue_id AND status = "AVAILABLE"'
        );
        $venueStatement->execute(['venue_id' => $venueId]);
    }

    logReservationActivity(
        $createdReservationId,
        'created',
        null,
        $downpaymentReference === ''
            ? 'Reservation request created.'
            : 'Reservation request created with required downpayment details.'
    );

    $createdReservation = fetchReservationById($createdReservationId);
    $receivedEmailSent = $createdReservation
        ? sendReservationReceivedEmail($createdReservation)
        : false;

    if (!$createdReservation) {
        sendError('Reservation was created but could not be loaded.', 500);
    }

    $createdReservation['receivedEmailSent'] = $receivedEmailSent;
    sendSuccess($createdReservation, 201);
}

$user = requireRole(['ADMIN', 'STAFF']);
$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    sendError('A valid reservation id is required.', 400);
}

$existingReservation = fetchReservationById($id);
if (!$existingReservation) {
    sendError('Reservation not found.', 404);
}

$venue = assertVenueExists((int)($body['venueId'] ?? $existingReservation['venueId']));
$schedule = normalizeSchedule($venue, [
    'scheduledTime' => array_key_exists('scheduledTime', $body) ? $body['scheduledTime'] : $existingReservation['scheduledTime'],
    'startTime' => array_key_exists('startTime', $body) ? $body['startTime'] : $existingReservation['startTime'],
    'endTime' => array_key_exists('endTime', $body) ? $body['endTime'] : $existingReservation['endTime'],
]);

if (in_array($existingReservation['status'], ['APPROVED', 'LATE', 'CHECKED_IN'], true)) {
    assertVenueNotOccupied($venue, $existingReservation);
    assertNoApprovedConflict($venue, (string)($body['reservationDate'] ?? $existingReservation['reservationDate']), $schedule, $id);
}

$statement = $pdo->prepare(
    'UPDATE reservations
     SET customer_name = :customer_name,
         customer_email = :customer_email,
         customer_phone = :customer_phone,
         venue_id = :venue_id,
         reservation_date = :reservation_date,
         scheduled_time = :scheduled_time,
         start_time = :start_time,
         end_time = :end_time,
         guest_count = :guest_count,
         updated_at = NOW()
     WHERE id = :id'
);
$statement->execute([
    'id' => $id,
    'customer_name' => trim((string)($body['customerName'] ?? $existingReservation['customerName'])),
    'customer_email' => trim((string)($body['customerEmail'] ?? $existingReservation['customerEmail'])),
    'customer_phone' => trim((string)($body['customerPhone'] ?? $existingReservation['customerPhone'])),
    'venue_id' => (int)($body['venueId'] ?? $existingReservation['venueId']),
    'reservation_date' => (string)($body['reservationDate'] ?? $existingReservation['reservationDate']),
    'scheduled_time' => $schedule['scheduledTime'],
    'start_time' => $schedule['startTime'],
    'end_time' => $schedule['endTime'],
    'guest_count' => (int)($body['guestCount'] ?? $existingReservation['guestCount']),
]);

logReservationActivity($id, 'adjusted', (int)$user['id'], 'Reservation details adjusted.');

sendSuccess(fetchReservationById($id));
