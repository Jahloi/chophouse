<?php

declare(strict_types=1);

function normalizeVenueType(string $value): string
{
    $upper = strtoupper(trim($value));
    return $upper === 'ROOM' ? 'ROOM' : 'VIP_LOUNGE';
}

function normalizeVenueStatus(string $value): string
{
    $upper = strtoupper(trim($value));
    $allowed = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'STANDBY', 'MAINTENANCE'];
    return in_array($upper, $allowed, true) ? $upper : 'AVAILABLE';
}

function normalizeReservationStatus(string $value): string
{
    $upper = strtoupper(trim($value));
    $allowed = ['PENDING', 'APPROVED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'LATE', 'NO_SHOW'];
    return in_array($upper, $allowed, true) ? $upper : 'PENDING';
}

function parseTimeToMinutes(?string $value): int
{
    if (!$value || !preg_match('/^\d{2}:\d{2}$/', $value)) {
        return -1;
    }

    [$hours, $minutes] = array_map('intval', explode(':', $value));
    if ($hours > 23 || $minutes > 59) {
        return -1;
    }

    return ($hours * 60) + $minutes;
}

function toOperationalMinutes(?string $value): int
{
    $minutes = parseTimeToMinutes($value);
    if ($minutes < 0) {
        return -1;
    }

    return $minutes < (17 * 60) ? $minutes + (24 * 60) : $minutes;
}

function isValidRoomRange(?string $startTime, ?string $endTime): bool
{
    $start = toOperationalMinutes($startTime);
    $end = toOperationalMinutes($endTime);
    return $start >= 0 && $end >= 0 && $end > $start;
}

function reservationSchedulesConflict(string $venueType, array $left, array $right): bool
{
    if ($venueType === 'ROOM') {
        return toOperationalMinutes($left['startTime'] ?? null) < toOperationalMinutes($right['endTime'] ?? null)
            && toOperationalMinutes($right['startTime'] ?? null) < toOperationalMinutes($left['endTime'] ?? null);
    }

    return true;
}
