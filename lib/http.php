<?php

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', defined('APP_DEBUG') && APP_DEBUG ? '1' : '0');

set_exception_handler(static function (Throwable $exception): void {
    error_log((string)$exception);

    if (headers_sent()) {
        echo defined('APP_DEBUG') && APP_DEBUG ? $exception->getMessage() : 'Server error.';
        exit;
    }

    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => defined('APP_DEBUG') && APP_DEBUG
            ? $exception->getMessage()
            : 'Server error.',
    ]);
    exit;
});

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }

    throw new ErrorException($message, 0, $severity, $file, $line);
});

function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function sendJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function sendSuccess($data, int $statusCode = 200): never
{
    sendJson([
        'success' => true,
        'data' => $data,
    ], $statusCode);
}

function sendError(string $message, int $statusCode = 400): never
{
    sendJson([
        'success' => false,
        'error' => $message,
    ], $statusCode);
}

function requireMethod(array $allowedMethods): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, $allowedMethods, true)) {
        sendError('Method not allowed.', 405);
    }

    return $method;
}
