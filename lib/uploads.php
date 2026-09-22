<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

function ensureUploadedFilesTable(): void
{
    static $checked = false;

    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS uploaded_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            storage_key VARCHAR(160) NOT NULL UNIQUE,
            original_name VARCHAR(255) NULL,
            mime_type VARCHAR(120) NOT NULL,
            extension VARCHAR(16) NOT NULL,
            file_size INT NOT NULL,
            content LONGBLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )'
    );

    $checked = true;
}

function uploadMimeType(array $file): string
{
    $tmpName = (string)($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_file($tmpName)) {
        return '';
    }

    return mime_content_type($tmpName) ?: '';
}

function storeUploadedFile(
    array $file,
    array $allowedTypes,
    int $maxBytes,
    string $directory,
    string $prefix,
    string $missingMessage,
    string $typeMessage,
    string $sizeMessage,
    string $folderMessage,
    string $saveMessage
): string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        sendError($missingMessage, 400);
    }

    $mimeType = uploadMimeType($file);
    if (!isset($allowedTypes[$mimeType])) {
        sendError($typeMessage, 400);
    }

    $fileSize = (int)($file['size'] ?? 0);
    if ($fileSize <= 0 || $fileSize > $maxBytes) {
        sendError($sizeMessage, 400);
    }

    $extension = $allowedTypes[$mimeType];
    $fileName = $prefix . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)) . '.' . $extension;

    if (UPLOAD_STORAGE_DRIVER === 'database') {
        ensureUploadedFilesTable();

        $content = file_get_contents((string)$file['tmp_name']);
        if ($content === false) {
            sendError($saveMessage, 500);
        }

        $storageKey = $prefix . '-' . bin2hex(random_bytes(12)) . '.' . $extension;
        $statement = db()->prepare(
            'INSERT INTO uploaded_files
                (storage_key, original_name, mime_type, extension, file_size, content)
             VALUES
                (:storage_key, :original_name, :mime_type, :extension, :file_size, :content)'
        );
        $statement->bindValue(':storage_key', $storageKey);
        $statement->bindValue(':original_name', (string)($file['name'] ?? $fileName));
        $statement->bindValue(':mime_type', $mimeType);
        $statement->bindValue(':extension', $extension);
        $statement->bindValue(':file_size', $fileSize, PDO::PARAM_INT);
        $statement->bindValue(':content', $content, PDO::PARAM_LOB);
        $statement->execute();

        return '/api/uploads/' . rawurlencode($storageKey);
    }

    $uploadRoot = __DIR__ . '/../uploads/' . trim($directory, '/');
    if (!is_dir($uploadRoot) && !mkdir($uploadRoot, 0775, true)) {
        sendError($folderMessage, 500);
    }

    $targetPath = $uploadRoot . '/' . $fileName;
    if (!move_uploaded_file((string)$file['tmp_name'], $targetPath)) {
        sendError($saveMessage, 500);
    }

    return 'uploads/' . trim($directory, '/') . '/' . $fileName;
}

function serveUploadedFile(string $storageKey): never
{
    ensureUploadedFilesTable();

    if (!preg_match('/^[A-Za-z0-9._-]+$/', $storageKey)) {
        sendError('Uploaded file not found.', 404);
    }

    $statement = db()->prepare(
        'SELECT mime_type, file_size, content
         FROM uploaded_files
         WHERE storage_key = :storage_key
         LIMIT 1'
    );
    $statement->execute(['storage_key' => $storageKey]);
    $file = $statement->fetch();

    if (!$file) {
        sendError('Uploaded file not found.', 404);
    }

    header('Content-Type: ' . $file['mime_type']);
    header('Content-Length: ' . (int)$file['file_size']);
    header('Cache-Control: public, max-age=31536000, immutable');
    echo $file['content'];
    exit;
}
