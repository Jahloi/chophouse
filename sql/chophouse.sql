CREATE DATABASE IF NOT EXISTS chophouse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chophouse;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'STAFF') NOT NULL DEFAULT 'STAFF',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  venue_type ENUM('VIP_LOUNGE', 'ROOM') NOT NULL,
  capacity_min INT NULL,
  capacity_max INT NULL,
  notes VARCHAR(255) NULL,
  status ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'STANDBY', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  customer_phone VARCHAR(60) NOT NULL,
  venue_id INT NOT NULL,
  reservation_date DATE NOT NULL,
  scheduled_time CHAR(5) NULL,
  start_time CHAR(5) NULL,
  end_time CHAR(5) NULL,
  guest_count INT NOT NULL,
  downpayment_amount DECIMAL(10,2) NULL,
  downpayment_method VARCHAR(60) NULL,
  downpayment_reference VARCHAR(120) NULL,
  downpayment_receipt_path VARCHAR(255) NULL,
  id_verification_path VARCHAR(255) NULL,
  downpayment_status VARCHAR(40) NOT NULL DEFAULT 'UNPAID',
  status ENUM('PENDING', 'APPROVED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'LATE', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reservation_status_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  old_status ENUM('PENDING', 'APPROVED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'LATE', 'NO_SHOW') NULL,
  new_status ENUM('PENDING', 'APPROVED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'LATE', 'NO_SHOW') NOT NULL,
  changed_by_user_id INT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_status_logs_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reservation_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  details VARCHAR(255) NULL,
  changed_by_user_id INT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_logs_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  gcash_qr_path VARCHAR(255) NOT NULL DEFAULT 'assets/gcash-qr-sample.svg',
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_settings_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO payment_settings (id, gcash_qr_path)
VALUES (1, 'assets/gcash-qr-sample.svg')
ON DUPLICATE KEY UPDATE gcash_qr_path = gcash_qr_path;

CREATE TABLE IF NOT EXISTS sensor_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_id VARCHAR(120) NOT NULL UNIQUE,
  venue_id INT NULL,
  label VARCHAR(120) NOT NULL,
  location VARCHAR(190) NOT NULL,
  status VARCHAR(40) NOT NULL,
  status_label VARCHAR(80) NOT NULL,
  sensor_online TINYINT(1) NOT NULL DEFAULT 0,
  network_mode VARCHAR(40) NOT NULL DEFAULT 'offline',
  ip_address VARCHAR(80) NOT NULL DEFAULT '0.0.0.0',
  last_seen_ms INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storage_key VARCHAR(160) NOT NULL UNIQUE,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(120) NOT NULL,
  extension VARCHAR(16) NOT NULL,
  file_size INT NOT NULL,
  content LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password_hash, role, is_active)
VALUES
  ('Admin User', 'admin@gmail.com', '$2y$10$3wiJSH9vv5iMJzpAkkaICOQLr.W6gGFeS6xYj9oGsaNCHkf6XKlJa', 'ADMIN', 1),
  ('Staff User', 'staff@gmail.com', '$2y$10$5BRhycpfJuRCOuBHmT/y1.2D3vpzvRX2KTZXiBQiWfKA472VU.LlW', 'STAFF', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  password_hash = VALUES(password_hash),
  role = VALUES(role),
  is_active = VALUES(is_active);

INSERT INTO venues (name, venue_type, capacity_min, capacity_max, notes, status)
VALUES
  ('VIP Lounge 1', 'VIP_LOUNGE', 2, 4, 'Near the entrance', 'AVAILABLE'),
  ('VIP Lounge 2', 'VIP_LOUNGE', 4, 6, 'Best for family groups', 'OCCUPIED'),
  ('VIP Lounge 3', 'VIP_LOUNGE', 2, 2, 'Quiet corner seating', 'AVAILABLE'),
  ('VIP Lounge 4', 'VIP_LOUNGE', 6, 8, 'Large dining group', 'OCCUPIED'),
  ('VIP Lounge 5', 'VIP_LOUNGE', 2, 4, 'Close to the service area', 'AVAILABLE'),
  ('KTV Room 1', 'ROOM', 4, 8, 'VIP room package', 'AVAILABLE'),
  ('KTV Room 2', 'ROOM', 6, 10, 'Large room with bar', 'OCCUPIED'),
  ('KTV Room 3', 'ROOM', 4, 6, 'Standard KTV package', 'AVAILABLE')
ON DUPLICATE KEY UPDATE
  venue_type = VALUES(venue_type),
  capacity_min = VALUES(capacity_min),
  capacity_max = VALUES(capacity_max),
  notes = VALUES(notes),
  status = VALUES(status);

INSERT INTO sensor_statuses (sensor_id, label, location, status, status_label, sensor_online, network_mode, ip_address, last_seen_ms)
VALUES ('room-1', 'KTV Room 1', 'Floor 2 - VIP Wing', 'available', 'Available', 0, 'offline', '0.0.0.0', 0)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  location = VALUES(location),
  status = VALUES(status),
  status_label = VALUES(status_label),
  sensor_online = VALUES(sensor_online),
  network_mode = VALUES(network_mode),
  ip_address = VALUES(ip_address),
  last_seen_ms = VALUES(last_seen_ms);
