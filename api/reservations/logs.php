<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['GET']);
requireRole(['ADMIN', 'STAFF']);
ensureReservationActivityLogsTable();
ensureReservationDownpaymentColumns();
ensureReservationStatusSchema();

$reservationRows = db()->query(
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
     ORDER BY reservations.created_at DESC'
)->fetchAll();

$reservations = array_map(static function (array $row): array {
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
}, $reservationRows);

$activityRows = db()->query(
    'SELECT source_logs.logId, source_logs.reservationId, source_logs.actionType,
            source_logs.oldStatus, source_logs.newStatus, source_logs.details,
            source_logs.changedAt, users.name AS changedByName, users.email AS changedByEmail,
            reservations.customer_name AS customerName, reservations.status AS currentStatus,
            venues.name AS venueName, venues.venue_type AS venueType
     FROM (
        SELECT id AS logId, reservation_id AS reservationId, action_type AS actionType,
               NULL AS oldStatus, NULL AS newStatus, details, changed_by_user_id AS changedByUserId,
               changed_at AS changedAt
        FROM reservation_activity_logs
        UNION ALL
        SELECT id AS logId, reservation_id AS reservationId,
               CASE
                 WHEN new_status = "APPROVED" THEN "approved"
                 WHEN new_status = "CANCELLED" THEN "cancelled"
                 WHEN new_status = "CHECKED_IN" THEN "checked_in"
                 WHEN new_status = "CHECKED_OUT" THEN "checked_out"
                 WHEN new_status = "LATE" THEN "late"
                 WHEN new_status = "NO_SHOW" THEN "no_show"
                 ELSE "status_changed"
               END AS actionType,
               old_status AS oldStatus, new_status AS newStatus,
               CONCAT("Status changed from ", COALESCE(old_status, "none"), " to ", new_status, ".") AS details,
               changed_by_user_id AS changedByUserId, changed_at AS changedAt
        FROM reservation_status_logs
     ) AS source_logs
     INNER JOIN reservations ON reservations.id = source_logs.reservationId
     INNER JOIN venues ON venues.id = reservations.venue_id
     LEFT JOIN users ON users.id = source_logs.changedByUserId
     ORDER BY source_logs.changedAt DESC, source_logs.logId DESC'
)->fetchAll();

$activityLogs = array_map(static function (array $row): array {
    return [
        'id' => (int)$row['logId'],
        'reservationId' => (int)$row['reservationId'],
        'actionType' => $row['actionType'],
        'oldStatus' => $row['oldStatus'],
        'newStatus' => $row['newStatus'],
        'details' => $row['details'],
        'changedAt' => $row['changedAt'],
        'changedByName' => $row['changedByName'],
        'changedByEmail' => $row['changedByEmail'],
        'customerName' => $row['customerName'],
        'currentStatus' => $row['currentStatus'],
        'venueName' => $row['venueName'],
        'venueType' => $row['venueType'],
    ];
}, $activityRows);

sendSuccess([
    'reservations' => $reservations,
    'activityLogs' => $activityLogs,
]);
