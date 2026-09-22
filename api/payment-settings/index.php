<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/http.php';
require_once __DIR__ . '/../../lib/uploads.php';

function ensurePaymentSettingsTable(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS payment_settings (
            id TINYINT PRIMARY KEY DEFAULT 1,
            gcash_qr_path VARCHAR(255) NOT NULL DEFAULT "assets/gcash-qr-sample.svg",
            updated_by_user_id INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_payment_settings_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )'
    );

    db()->exec(
        'INSERT INTO payment_settings (id, gcash_qr_path)
         VALUES (1, "assets/gcash-qr-sample.svg")
         ON DUPLICATE KEY UPDATE gcash_qr_path = gcash_qr_path'
    );

    $checked = true;
}

function fetchPaymentSettings(): array
{
    ensurePaymentSettingsTable();

    $settings = db()->query(
        'SELECT gcash_qr_path AS gcashQrPath, updated_at AS updatedAt
         FROM payment_settings
         WHERE id = 1'
    )->fetch();

    return [
        'method' => 'GCash',
        'gcashQrPath' => $settings['gcashQrPath'] ?? 'assets/gcash-qr-sample.svg',
        'updatedAt' => $settings['updatedAt'] ?? null,
    ];
}

function uploadPaymentQr(array $file): string
{
    return storeUploadedFile(
        $file,
        [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
        ],
        3 * 1024 * 1024,
        'payment',
        'gcash-qr',
        'Upload a valid GCash QR image.',
        'GCash QR must be a JPG, PNG, WEBP, or SVG image.',
        'GCash QR image must be 3MB or smaller.',
        'Unable to prepare payment upload folder.',
        'Unable to save the uploaded GCash QR image.'
    );
}

$method = requireMethod(['GET', 'POST']);

if ($method === 'GET') {
    sendSuccess(fetchPaymentSettings());
}

$user = requireRole(['ADMIN']);
$qrPath = uploadPaymentQr($_FILES['gcashQr'] ?? []);

$statement = db()->prepare(
    'UPDATE payment_settings
     SET gcash_qr_path = :gcash_qr_path, updated_by_user_id = :updated_by_user_id, updated_at = NOW()
     WHERE id = 1'
);
$statement->execute([
    'gcash_qr_path' => $qrPath,
    'updated_by_user_id' => (int)$user['id'],
]);

sendSuccess(fetchPaymentSettings());
