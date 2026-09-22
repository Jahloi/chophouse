<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/email.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['PATCH']);
$user = requireRole(['ADMIN', 'STAFF']);
$body = jsonBody();
$id = (int)($_GET['id'] ?? 0);
ensureReservationStatusSchema();

db()->exec(
    'ALTER TABLE venues
     MODIFY status ENUM("AVAILABLE", "OCCUPIED", "RESERVED", "STANDBY", "MAINTENANCE")
     NOT NULL DEFAULT "AVAILABLE"'
);

if ($id <= 0) {
    sendError('A valid reservation id is required.', 400);
}

$status = normalizeReservationStatus((string)($body['status'] ?? ''));
$existingReservation = fetchReservationById($id);
if (!$existingReservation) {
    sendError('Reservation not found.', 404);
}

if (in_array($status, ['APPROVED', 'CHECKED_IN', 'LATE'], true)) {
    $venue = assertVenueExists((int)$existingReservation['venue']['id']);

    if ($status !== 'CHECKED_IN') {
        assertVenueNotOccupied($venue, $existingReservation);
        assertNoApprovedConflict($venue, $existingReservation['reservationDate'], [
            'scheduledTime' => $existingReservation['scheduledTime'],
            'startTime' => $existingReservation['startTime'],
            'endTime' => $existingReservation['endTime'],
        ], $id);
    }
}

$statement = db()->prepare('UPDATE reservations SET status = :status, updated_at = NOW() WHERE id = :id');
$statement->execute([
    'status' => $status,
    'id' => $id,
]);

if (in_array($status, ['APPROVED', 'LATE'], true)) {
    db()->prepare(
        'UPDATE venues
         SET status = "RESERVED", updated_at = NOW()
         WHERE id = :venue_id
           AND status IN ("AVAILABLE", "STANDBY")'
    )->execute([
        'venue_id' => (int)$existingReservation['venueId'],
    ]);
}

if ($status === 'CHECKED_IN') {
    db()->prepare(
        'UPDATE venues
         SET status = "OCCUPIED", updated_at = NOW()
         WHERE id = :venue_id'
    )->execute([
        'venue_id' => (int)$existingReservation['venueId'],
    ]);
}

if (in_array($status, ['CANCELLED', 'CHECKED_OUT', 'NO_SHOW'], true)) {
    $activeStatement = db()->prepare(
        'SELECT COUNT(*) AS active_count
         FROM reservations
         WHERE venue_id = :venue_id
           AND id <> :reservation_id
           AND (
                status IN ("APPROVED", "CHECKED_IN", "LATE")
                OR (status = "PENDING" AND downpayment_status = "PENDING")
           )'
    );
    $activeStatement->execute([
        'venue_id' => (int)$existingReservation['venueId'],
        'reservation_id' => $id,
    ]);

    if ((int)($activeStatement->fetch()['active_count'] ?? 0) === 0) {
        db()->prepare(
            'UPDATE venues
             SET status = "AVAILABLE", updated_at = NOW()
             WHERE id = :venue_id
               AND status IN ("RESERVED", "STANDBY", "OCCUPIED")'
        )->execute([
            'venue_id' => (int)$existingReservation['venueId'],
        ]);
    }
}

db()->prepare(
    'INSERT INTO reservation_status_logs (reservation_id, old_status, new_status, changed_by_user_id)
     VALUES (:reservation_id, :old_status, :new_status, :changed_by_user_id)'
)->execute([
    'reservation_id' => $id,
    'old_status' => $existingReservation['status'],
    'new_status' => $status,
    'changed_by_user_id' => (int)$user['id'],
]);

$updatedReservation = fetchReservationById($id);
$approvalEmailSent = false;
$statusEmailSent = false;

if ($status === 'APPROVED' && $updatedReservation) {
    $approvalEmailSent = sendReservationApprovedEmail($updatedReservation);
}

if ($status !== 'APPROVED' && $updatedReservation) {
    $statusEmailSent = sendReservationStatusUpdateEmail($updatedReservation, $status);
}

sendSuccess([
    'reservation' => $updatedReservation,
    'approvalEmailSent' => $approvalEmailSent,
    'statusEmailSent' => $statusEmailSent,
]);
