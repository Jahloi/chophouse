<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/http.php';

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    $sslMode = defined('DB_SSL_MODE') ? DB_SSL_MODE : '';
    if ($sslMode !== '' && !in_array($sslMode, ['disabled', 'disable', 'false', '0'], true)) {
        $options[PDO::MYSQL_ATTR_SSL_CA] = DB_SSL_CA ?: '/etc/ssl/certs/ca-certificates.crt';
    } elseif (defined('DB_SSL_CA') && DB_SSL_CA) {
        $options[PDO::MYSQL_ATTR_SSL_CA] = DB_SSL_CA;
    }

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $exception) {
        error_log($exception->getMessage());
        sendError(
            'Database connection failed. Make sure MySQL is running and config/config.php uses the correct database port.',
            503
        );
    }

    return $pdo;
}
