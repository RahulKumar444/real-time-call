-- ============================================================
-- SyncSpace — Database Schema
-- Database: MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS rtc_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rtc_app;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100)      NOT NULL,
  email        VARCHAR(255)      NOT NULL,
  password     VARCHAR(255)      NOT NULL, -- bcrypt hash
  created_at   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ============================================================
-- FILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  original_name VARCHAR(255)      NOT NULL,
  file_name     VARCHAR(255)      NOT NULL,
  mime_type     VARCHAR(100)      NOT NULL,
  size          INT UNSIGNED      NOT NULL,
  uploaded_by   INT UNSIGNED      NOT NULL,
  room_id       VARCHAR(50)       NOT NULL,
  created_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_files_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
