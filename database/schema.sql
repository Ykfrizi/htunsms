CREATE DATABASE IF NOT EXISTS `htu nspms`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `htu nspms`;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  telephone VARCHAR(32) NOT NULL,
  role ENUM('personnel', 'hr', 'supervisor', 'administrator') NOT NULL DEFAULT 'personnel',
  permissions JSON NOT NULL,
  unit_ids JSON NOT NULL,
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  email_verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_users_role_status (role, account_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS personnel (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  nss_number CHAR(15) NOT NULL UNIQUE,
  national_id CHAR(15) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_personnel_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nss_registry (
  nss_number CHAR(15) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_nss_registry_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  personnel_uid CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  programme VARCHAR(160) NOT NULL,
  qualification VARCHAR(80) NULL,
  personnel_email VARCHAR(254) NULL,
  intake_id VARCHAR(80) NOT NULL,
  telephone VARCHAR(32) NOT NULL,
  solicitor_name VARCHAR(120) NULL,
  solicitor_contact VARCHAR(254) NULL,
  requested_unit_id VARCHAR(120) NULL,
  position_interest VARCHAR(40) NULL,
  application_status ENUM('DRAFT', 'SUBMITTED', 'RESUBMITTED', 'CORRECTION_REQUIRED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  verification_status ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  decision_reason VARCHAR(2000) NULL,
  decided_by CHAR(36) NULL,
  decided_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_applications_personnel FOREIGN KEY (personnel_uid) REFERENCES users(id),
  CONSTRAINT fk_applications_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
  INDEX idx_applications_personnel_created (personnel_uid, created_at),
  INDEX idx_applications_status_submitted (application_status, submitted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(120) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  unit_type VARCHAR(40) NOT NULL DEFAULT 'department',
  department_id VARCHAR(120) NULL,
  supervisor_uid CHAR(36) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_units_supervisor FOREIGN KEY (supervisor_uid) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS qualification VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS personnel_email VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS solicitor_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS solicitor_contact VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS requested_unit_id VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS position_interest VARCHAR(40) NULL;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(40) NOT NULL DEFAULT 'department';

INSERT INTO units (id, name, unit_type, department_id) VALUES
  ('directorate-academic-affairs', 'Directorate of Academic Affairs', 'directorate', NULL),
  ('directorate-human-resource', 'Directorate of Human Resource', 'directorate', NULL),
  ('directorate-public-affairs', 'Directorate of Public Affairs', 'directorate', NULL),
  ('directorate-career-placement', 'Directorate of Career Placement and Counselling', 'directorate', NULL),
  ('directorate-finance', 'Directorate of Finance', 'directorate', NULL),
  ('directorate-works-physical-development', 'Directorate of Works and Physical Development', 'directorate', NULL),
  ('university-library-directorate', 'University Library Directorate', 'directorate', NULL),
  ('faculty-applied-sciences-technology', 'Faculty of Applied Sciences and Technology', 'faculty', NULL),
  ('department-computer-science', 'Department of Computer Science', 'department', 'faculty-applied-sciences-technology'),
  ('department-food-science', 'Department of Food Science', 'department', 'faculty-applied-sciences-technology'),
  ('department-agro-enterprise-development', 'Department of Agro Enterprise Development', 'department', 'faculty-applied-sciences-technology'),
  ('faculty-applied-social-sciences', 'Faculty of Applied Social Sciences', 'faculty', NULL),
  ('faculty-engineering', 'Faculty of Engineering', 'faculty', NULL),
  ('department-electrical-engineering', 'Department of Electrical Engineering', 'department', 'faculty-engineering'),
  ('department-civil-engineering', 'Department of Civil Engineering', 'department', 'faculty-engineering'),
  ('department-mechanical-engineering', 'Department of Mechanical Engineering', 'department', 'faculty-engineering'),
  ('faculty-built-natural-environment', 'Faculty of Built and Natural Environment', 'faculty', NULL),
  ('faculty-art-design', 'Faculty of Art and Design', 'faculty', NULL),
  ('htu-business-school', 'HTU Business School', 'faculty', NULL),
  ('department-accountancy', 'Department of Accountancy', 'department', 'htu-business-school'),
  ('department-procurement-supply', 'Department of Procurement and Supply', 'department', 'htu-business-school'),
  ('department-marketing', 'Department of Marketing', 'department', 'htu-business-school'),
  ('department-banking-finance', 'Department of Banking and Finance', 'department', 'htu-business-school'),
  ('center-continuing-degree-education', 'Center for Continuing Degree and Education (CCDE)', 'center', NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  unit_type = VALUES(unit_type),
  department_id = VALUES(department_id);

CREATE TABLE IF NOT EXISTS deployments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  personnel_uid CHAR(36) NOT NULL,
  unit_id VARCHAR(120) NOT NULL,
  department_id VARCHAR(120) NULL,
  supervisor_uid CHAR(36) NULL,
  reporting_location VARCHAR(240) NOT NULL,
  reporting_date DATE NOT NULL,
  status ENUM('ACTIVE', 'REPORTED', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
  active_personnel_uid CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status = 'ACTIVE' THEN personnel_uid ELSE NULL END
  ) STORED,
  assigned_by CHAR(36) NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reported_at DATETIME(3) NULL,
  report_date DATE NULL,
  confirmed_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_deployments_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_deployments_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_deployments_supervisor FOREIGN KEY (supervisor_uid) REFERENCES users(id),
  CONSTRAINT fk_deployments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT fk_deployments_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id),
  UNIQUE KEY uq_deployments_active_personnel (active_personnel_uid),
  INDEX idx_deployments_person_status (personnel_uid, status),
  INDEX idx_deployments_unit_status (unit_id, status)
) ENGINE=InnoDB;

-- Approved imported applications may not have a corresponding local login account.
ALTER TABLE deployments
  DROP FOREIGN KEY IF EXISTS fk_deployments_personnel;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_uid CHAR(36) NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target_id VARCHAR(120) NOT NULL,
  reason VARCHAR(2000) NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_uid) REFERENCES users(id),
  INDEX idx_audit_target (target_id, occurred_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_sessions_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('verify_email', 'reset_password') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_auth_tokens_user_purpose (user_id, purpose),
  INDEX idx_auth_tokens_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
  numeric_value BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

INSERT INTO system_settings (setting_key, numeric_value)
VALUES ('next_application_reference', 1)
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS active_personnel_uid CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status = 'ACTIVE' THEN personnel_uid ELSE NULL END
  ) PERSISTENT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deployments_active_personnel
  ON deployments (active_personnel_uid);
