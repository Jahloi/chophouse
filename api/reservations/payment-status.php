<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['PATCH']);
$user = requireRole(['ADMIN', 'STAFF']);
$body = jsonBody();
$id = (int)($_GET['id'] ?? 0);

if ($id <= 0) {
    sendError('A valid reservation id is required.', 400);
}

$allowedStatuses = ['PENDING', 'VERIFIED', 'REJECTED', 'UNPAID'];
$nextStatus = strtoupper(trim((string)($body['downpaymentStatus'] ?? $body['status'] ?? '')));
$remarks = trim((string)($body['remarks'] ?? ''));

if (!in_array($nextStatus, $allowedStatuses, true)) {
    sendError('Choose a valid downpayment status.', 400);
}

$existingReservation = fetchReservationById($id);
if (!$existingReservation) {
    sendError('Reservation not found.', 404);
}

db()->prepare(
    'UPDATE reservations
     SET downpayment_status = :downpayment_status,
         updated_at = NOW()
     WHERE id = :id'
)->execute([
    'downpayment_status' => $nextStatus,
    'id' => $id,
]);

$actionType = match ($nextStatus) {
    'VERIFIED' => 'payment_verified',
    'REJECTED' => 'payment_rejected',
    'PENDING' => 'payment_pending',
    default => 'payment_unpaid',
};

$details = $remarks !== ''
    ? $remarks
    : 'Downpayment status changed from ' . ($existingReservation['downpaymentStatus'] ?? 'UNPAID') . ' to ' . $nextStatus . '.';

logReservationActivity($id, $actionType, (int)$user['id'], $details);

sendSuccess(fetchReservationById($id));
