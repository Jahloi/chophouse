<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/helpers.php';

function appBaseUrl(): string
{
    if (defined('APP_URL') && APP_URL !== '') {
        $url = APP_URL;
        if (!str_starts_with($url, 'http://') && !str_starts_with($url, 'https://')) {
            $url = 'https://' . $url;
        }

        return rtrim($url, '/');
    }

    return '';
}

function appUrl(string $path): string
{
    $baseUrl = appBaseUrl();
    if ($baseUrl === '') {
        return ltrim($path, '/');
    }

    return $baseUrl . '/' . ltrim($path, '/');
}

function sendAppEmail(string $to, string $subject, array $messageLines): bool
{
    $message = implode("\r\n", $messageLines);

    if (defined('RESEND_API_KEY') && RESEND_API_KEY !== '') {
        $payload = json_encode([
            'from' => MAIL_FROM_NAME . ' <' . MAIL_FROM_ADDRESS . '>',
            'to' => [$to],
            'subject' => $subject,
            'text' => $message,
        ]);

        if ($payload === false || !function_exists('curl_init')) {
            return false;
        }

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . RESEND_API_KEY,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);

        curl_exec($ch);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($statusCode >= 200 && $statusCode < 300) {
            return true;
        }

        error_log(sprintf('Email API failed for %s with status %d. %s', $to, $statusCode, $error));
        return false;
    }

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM_ADDRESS . '>',
        'Reply-To: ' . MAIL_FROM_ADDRESS,
        'X-Mailer: PHP/' . PHP_VERSION,
    ];

    if (PHP_OS_FAMILY === 'Windows') {
        ini_set('sendmail_from', MAIL_FROM_ADDRESS);
    }

    return @mail($to, $subject, $message, implode("\r\n", $headers));
}

function formatReservationScheduleForEmail(array $reservation): string
{
    $date = trim((string)($reservation['reservationDate'] ?? ''));
    $venueType = normalizeVenueType((string)($reservation['venue']['venueType'] ?? 'VIP_LOUNGE'));

    $dateLabel = $date;
    $dateValue = DateTimeImmutable::createFromFormat('Y-m-d', $date);
    if ($dateValue instanceof DateTimeImmutable) {
        $dateLabel = $dateValue->format('F j, Y');
    }

    if ($venueType === 'ROOM') {
        $startTime = (string)($reservation['startTime'] ?? '');
        $endTime = (string)($reservation['endTime'] ?? '');
        return sprintf('%s from %s to %s', $dateLabel, $startTime, $endTime);
    }

    $scheduledTime = (string)($reservation['scheduledTime'] ?? '');
    return sprintf('%s at %s', $dateLabel, $scheduledTime);
}

function sendReservationApprovedEmail(array $reservation): bool
{
    $customerEmail = trim((string)($reservation['customerEmail'] ?? ''));
    if ($customerEmail === '') {
        return false;
    }

    $customerName = trim((string)($reservation['customerName'] ?? 'Customer'));
    $reservationId = (int)($reservation['id'] ?? 0);
    $venueName = trim((string)($reservation['venue']['name'] ?? 'your selected venue'));
    $schedule = formatReservationScheduleForEmail($reservation);
    $guestCount = (int)($reservation['guestCount'] ?? 0);
    $guestLabel = $guestCount > 0
        ? sprintf("%d guest%s", $guestCount, $guestCount === 1 ? '' : 's')
        : 'your party';

    $sent = sendAppEmail($customerEmail, APP_NAME . ' reservation approved', [
        'Hello ' . $customerName . ',',
        '',
        'Your reservation has been approved.',
        'Reservation ID: #' . $reservationId,
        'Venue: ' . $venueName,
        'Schedule: ' . $schedule,
        'Party size: ' . $guestLabel,
        '',
        'Please arrive on time and present your reservation details to our staff.',
        '',
        'Thank you,',
        MAIL_FROM_NAME,
    ]);

    if (!$sent) {
        error_log(sprintf('Reservation approval email could not be sent to %s for reservation %d.', $customerEmail, $reservationId));
    }

    return $sent;
}

function sendReservationReceivedEmail(array $reservation): bool
{
    $customerEmail = trim((string)($reservation['customerEmail'] ?? ''));
    if ($customerEmail === '') {
        return false;
    }

    $reservationId = (int)($reservation['id'] ?? 0);
    $customerName = trim((string)($reservation['customerName'] ?? 'Customer'));
    $venueName = trim((string)($reservation['venue']['name'] ?? 'your selected venue'));
    $schedule = formatReservationScheduleForEmail($reservation);
    $statusUrl = appUrl('reservation-status.html');

    $sent = sendAppEmail($customerEmail, APP_NAME . ' reservation request received', [
        'Hello ' . $customerName . ',',
        '',
        'We received your reservation request.',
        'Reservation ID: #' . $reservationId,
        'Venue: ' . $venueName,
        'Schedule: ' . $schedule,
        '',
        'Use your email and Reservation ID to check your status here:',
        $statusUrl,
        '',
        'Your request is pending until staff or admin review is complete.',
        '',
        'Thank you,',
        MAIL_FROM_NAME,
    ]);

    if (!$sent) {
        error_log(sprintf('Reservation received email could not be sent to %s for reservation %d.', $customerEmail, $reservationId));
    }

    return $sent;
}

function sendReservationStatusUpdateEmail(array $reservation, string $status): bool
{
    $customerEmail = trim((string)($reservation['customerEmail'] ?? ''));
    if ($customerEmail === '') {
        return false;
    }

    $normalizedStatus = strtoupper(trim($status));
    $reservationId = (int)($reservation['id'] ?? 0);
    $customerName = trim((string)($reservation['customerName'] ?? 'Customer'));
    $venueName = trim((string)($reservation['venue']['name'] ?? 'your selected venue'));
    $schedule = formatReservationScheduleForEmail($reservation);
    $statusUrl = appUrl('reservation-status.html');

    $labels = [
        'CANCELLED' => ['cancelled', 'Your reservation has been cancelled.'],
        'CHECKED_IN' => ['checked in', 'You have been checked in for your reservation.'],
        'CHECKED_OUT' => ['checked out', 'Your reservation has been checked out. Thank you for visiting.'],
        'LATE' => ['marked late', 'Your reservation has been marked as late. Please contact the staff if you are still arriving.'],
        'NO_SHOW' => ['marked no-show', 'Your reservation has been marked as no-show.'],
    ];

    if (!isset($labels[$normalizedStatus])) {
        return false;
    }

    [$subjectStatus, $bodyLine] = $labels[$normalizedStatus];
    $sent = sendAppEmail($customerEmail, APP_NAME . ' reservation ' . $subjectStatus, [
        'Hello ' . $customerName . ',',
        '',
        $bodyLine,
        'Reservation ID: #' . $reservationId,
        'Venue: ' . $venueName,
        'Schedule: ' . $schedule,
        '',
        'You can check your current reservation status here:',
        $statusUrl,
        '',
        'Thank you,',
        MAIL_FROM_NAME,
    ]);

    if (!$sent) {
        error_log(sprintf(
            'Reservation status email could not be sent to %s for reservation %d with status %s.',
            $customerEmail,
            $reservationId,
            $normalizedStatus
        ));
    }

    return $sent;
}

function sendPasswordResetEmail(string $email, string $resetCode, string $expiresAt): bool
{
    return sendAppEmail($email, APP_NAME . ' password reset code', [
        'Hello,',
        '',
        'Use this password reset code within 15 minutes:',
        $resetCode,
        '',
        'Expires at: ' . $expiresAt,
        '',
        'If you did not request this, you can ignore this email.',
        '',
        'Thank you,',
        MAIL_FROM_NAME,
    ]);
}
