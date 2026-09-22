<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/reservations.php';

requireMethod(['GET']);
requireRole(['ADMIN', 'STAFF']);
ensureReservationDownpaymentColumns();
ensureReservationStatusSchema();

$format = strtolower(trim((string)($_GET['format'] ?? 'csv')));

$statement = db()->query(
    'SELECT reservations.id, reservations.customer_name AS customerName,
            reservations.customer_email AS customerEmail, reservations.customer_phone AS customerPhone,
            reservations.reservation_date AS reservationDate,
            reservations.scheduled_time AS scheduledTime, reservations.start_time AS startTime,
            reservations.end_time AS endTime, reservations.guest_count AS guestCount,
            reservations.downpayment_amount AS downpaymentAmount,
            reservations.downpayment_method AS downpaymentMethod,
            reservations.downpayment_reference AS downpaymentReference,
            reservations.downpayment_status AS downpaymentStatus,
            reservations.status, reservations.created_at AS createdAt, reservations.updated_at AS updatedAt,
            venues.name AS venueName, venues.venue_type AS venueType
     FROM reservations
     INNER JOIN venues ON venues.id = reservations.venue_id
     ORDER BY reservations.reservation_date DESC, reservations.created_at DESC'
);

$rows = $statement->fetchAll();

function reservationExportSchedule(array $row): string
{
    if (($row['venueType'] ?? '') === 'ROOM') {
        return trim((string)$row['reservationDate'] . ' ' . (string)$row['startTime'] . '-' . (string)$row['endTime']);
    }

    return trim((string)$row['reservationDate'] . ' ' . (string)$row['scheduledTime']);
}

function reservationExportRows(array $rows): array
{
    return array_map(static function (array $row): array {
        return [
            'ID' => (string)$row['id'],
            'Customer' => (string)$row['customerName'],
            'Email' => (string)$row['customerEmail'],
            'Phone' => (string)$row['customerPhone'],
            'Venue' => (string)$row['venueName'],
            'Type' => (string)$row['venueType'],
            'Schedule' => reservationExportSchedule($row),
            'Guests' => (string)$row['guestCount'],
            'Downpayment' => $row['downpaymentAmount'] === null ? '' : number_format((float)$row['downpaymentAmount'], 2),
            'Payment Method' => (string)$row['downpaymentMethod'],
            'Reference' => (string)$row['downpaymentReference'],
            'Payment Status' => (string)$row['downpaymentStatus'],
            'Reservation Status' => (string)$row['status'],
            'Created' => (string)$row['createdAt'],
            'Updated' => (string)$row['updatedAt'],
        ];
    }, $rows);
}

function outputCsv(array $rows): never
{
    $fileName = 'chophouse-reservations-' . date('Ymd-His') . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $fileName . '"');

    $handle = fopen('php://output', 'w');
    $exportRows = reservationExportRows($rows);
    $headers = array_keys($exportRows[0] ?? [
        'ID' => '',
        'Customer' => '',
        'Email' => '',
        'Phone' => '',
        'Venue' => '',
        'Type' => '',
        'Schedule' => '',
        'Guests' => '',
        'Downpayment' => '',
        'Payment Method' => '',
        'Reference' => '',
        'Payment Status' => '',
        'Reservation Status' => '',
        'Created' => '',
        'Updated' => '',
    ]);

    fputcsv($handle, $headers);
    foreach ($exportRows as $row) {
        fputcsv($handle, $row);
    }
    fclose($handle);
    exit;
}

function pdfText(string $value): string
{
    return str_replace(
        ['\\', '(', ')', "\r", "\n"],
        ['\\\\', '\\(', '\\)', ' ', ' '],
        $value
    );
}

function outputPdf(array $rows): never
{
    $lines = [
        APP_NAME . ' Reservation Report',
        'Generated: ' . date('F j, Y g:i A'),
        'Total reservations: ' . count($rows),
        '',
    ];

    foreach (reservationExportRows($rows) as $row) {
        $lines[] = sprintf(
            '#%s | %s | %s | %s | %s | %s',
            $row['ID'],
            $row['Customer'],
            $row['Venue'],
            $row['Schedule'],
            $row['Reservation Status'],
            $row['Payment Status']
        );
    }

    if (count($rows) === 0) {
        $lines[] = 'No reservations found.';
    }

    $pages = array_chunk($lines, 31);
    $objects = [
        1 => '<< /Type /Catalog /Pages 2 0 R >>',
    ];
    $pageObjectNumbers = [];
    $contentObjectNumbers = [];
    $nextObjectNumber = 4;

    foreach ($pages as $pageLines) {
        $pageObjectNumbers[] = $nextObjectNumber++;
        $contentObjectNumbers[] = $nextObjectNumber++;
    }

    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', array_map(static fn (int $number): string => $number . ' 0 R', $pageObjectNumbers)) . '] /Count ' . count($pageObjectNumbers) . ' >>';
    $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    foreach ($pages as $index => $pageLines) {
        $contentCommands = "BT\n/F1 11 Tf\n54 744 Td\n15 TL\n";
        foreach ($pageLines as $line) {
            $contentCommands .= '(' . pdfText($line) . ") Tj\nT*\n";
        }
        $contentCommands .= "ET\n";

        $objects[$pageObjectNumbers[$index]] = sprintf(
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>',
            $contentObjectNumbers[$index]
        );
        $objects[$contentObjectNumbers[$index]] = '<< /Length ' . strlen($contentCommands) . " >>\nstream\n" . $contentCommands . "endstream";
    }

    ksort($objects);
    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $objectNumber => $objectContent) {
        $offsets[$objectNumber] = strlen($pdf);
        $pdf .= $objectNumber . " 0 obj\n" . $objectContent . "\nendobj\n";
    }

    $xrefOffset = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n" . $xrefOffset . "\n%%EOF";

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="chophouse-reservations-' . date('Ymd-His') . '.pdf"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
    exit;
}

if ($format === 'csv') {
    outputCsv($rows);
}

if ($format === 'pdf') {
    outputPdf($rows);
}

sendError('Unsupported export format.', 400);
