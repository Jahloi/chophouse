<?php

declare(strict_types=1);

function configEnv(string|array $names, ?string $default = null, bool $allowEmpty = false): ?string
{
    foreach ((array)$names as $name) {
        $value = getenv($name);
        if ($value === false && array_key_exists($name, $_ENV)) {
            $value = (string)$_ENV[$name];
        }

        if ($value !== false && ($allowEmpty || trim((string)$value) !== '')) {
            return (string)$value;
        }
    }

    return $default;
}

function configBool(string|array $names, bool $default = false): bool
{
    $value = configEnv($names);
    if ($value === null) {
        return $default;
    }

    return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
}

function configDatabaseUrl(): array
{
    $databaseUrl = configEnv(['DATABASE_URL', 'MYSQL_URL']);
    if (!$databaseUrl) {
        return [];
    }

    $parts = parse_url($databaseUrl);
    if (!is_array($parts)) {
        return [];
    }

    $query = [];
    if (isset($parts['query'])) {
        parse_str($parts['query'], $query);
    }

    return [
        'host' => $parts['host'] ?? null,
        'port' => isset($parts['port']) ? (string)$parts['port'] : null,
        'name' => isset($parts['path']) ? ltrim($parts['path'], '/') : null,
        'user' => isset($parts['user']) ? rawurldecode($parts['user']) : null,
        'pass' => isset($parts['pass']) ? rawurldecode($parts['pass']) : null,
        'sslaccept' => isset($query['sslaccept']) ? (string)$query['sslaccept'] : null,
        'sslmode' => isset($query['ssl-mode']) ? (string)$query['ssl-mode'] : ($query['sslmode'] ?? null),
    ];
}

$databaseUrl = configDatabaseUrl();

define('APP_ENV', configEnv('APP_ENV', 'local') ?: 'local');
define('APP_DEBUG', configBool('APP_DEBUG', APP_ENV !== 'production'));
define('APP_URL', rtrim(configEnv(['APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'], '') ?: '', '/'));

define('DB_HOST', configEnv(['TIDB_HOST', 'DB_HOST', 'MYSQLHOST'], $databaseUrl['host'] ?? '127.0.0.1') ?: '127.0.0.1');
define('DB_PORT', (int)(configEnv(['TIDB_PORT', 'DB_PORT', 'MYSQLPORT'], $databaseUrl['port'] ?? '3306') ?: '3306'));
define('DB_NAME', configEnv(['TIDB_DATABASE', 'DB_NAME', 'MYSQLDATABASE', 'MYSQL_DATABASE'], $databaseUrl['name'] ?? 'chophouse') ?: 'chophouse');
define('DB_USER', configEnv(['TIDB_USER', 'DB_USER', 'MYSQLUSER', 'MYSQL_USER'], $databaseUrl['user'] ?? 'root') ?: 'root');
define('DB_PASS', configEnv(['TIDB_PASSWORD', 'DB_PASS', 'MYSQLPASSWORD', 'MYSQL_PASSWORD'], $databaseUrl['pass'] ?? '', true) ?? '');
define('DB_SSL_CA', configEnv('DB_SSL_CA'));
define('DB_SSL_MODE', strtolower(configEnv(['DB_SSL_MODE', 'TIDB_SSL_MODE'], $databaseUrl['sslaccept'] ?? $databaseUrl['sslmode'] ?? '') ?: ''));

define('SESSION_DURATION_HOURS', (int)(configEnv('SESSION_DURATION_HOURS', '12') ?: '12'));
define('APP_NAME', configEnv('APP_NAME', 'ChopHouse') ?: 'ChopHouse');
define('MAIL_FROM_ADDRESS', configEnv('MAIL_FROM_ADDRESS', 'noreply@chophouse.local') ?: 'noreply@chophouse.local');
define('MAIL_FROM_NAME', configEnv('MAIL_FROM_NAME', 'ChopHouse Reservations') ?: 'ChopHouse Reservations');
define('RESEND_API_KEY', configEnv('RESEND_API_KEY', '', true) ?? '');
define('UPLOAD_STORAGE_DRIVER', strtolower(configEnv('UPLOAD_STORAGE_DRIVER', 'local') ?: 'local'));
define('SENSOR_API_KEY', configEnv('SENSOR_API_KEY', '', true) ?? '');
