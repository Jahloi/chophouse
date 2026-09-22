<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/uploads.php';

requireMethod(['GET']);

$storageKey = trim((string)($_GET['key'] ?? ''));
if ($storageKey === '') {
    $path = trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
    $segments = explode('/', $path);
    $storageKey = (string)end($segments);
}

serveUploadedFile($storageKey);
