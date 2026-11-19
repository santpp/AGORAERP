-- =====================================================================
-- Agora Digital App · v11 · Módulo 02: seguridad
-- OTP, autorizaciones reforzadas, límites de peticiones, bloqueo de IP,
-- eventos de seguridad (trampa de código fuente, WAF) e integridad de archivos.
-- Requiere: 01_users_module.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Códigos de un solo uso. Solo se guarda el HMAC del código; vencen y tienen intentos limitados.
-- purpose: LOGIN (segundo paso), RECUPERACION (olvidé mi clave), VERIFICACION (dato cerrado o acción sensible),
--          CONTACTO (verificar correo o WhatsApp nuevo). user_id NULL = desafío señuelo (correo inexistente).
CREATE TABLE IF NOT EXISTS otp_challenges (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  org_id BIGINT UNSIGNED NULL,
  session_id CHAR(64) NULL,
  purpose VARCHAR(12) NOT NULL,
  action VARCHAR(48) NULL,
  scope VARCHAR(120) NULL,
  reason VARCHAR(255) NULL,
  channel VARCHAR(10) NULL,
  destination VARCHAR(190) NULL,
  code_hash CHAR(64) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
  sends INT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL,
  verified_at DATETIME(3) NULL,
  consumed_at DATETIME(3) NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_otp_user (user_id, created_at),
  KEY ix_otp_exp (expires_at),
  CONSTRAINT ck_otp_purpose CHECK (purpose IN ('LOGIN','RECUPERACION','VERIFICACION','CONTACTO')),
  CONSTRAINT ck_otp_channel CHECK (channel IS NULL OR channel IN ('EMAIL','WHATSAPP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Autorización temporal tras un OTP de verificación (p. ej. editar datos de un mes cerrado durante 10 minutos)
CREATE TABLE IF NOT EXISTS step_up_grants (
  id CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  org_id BIGINT UNSIGNED NOT NULL,
  session_id CHAR(64) NOT NULL,
  challenge_id CHAR(26) NOT NULL,
  action VARCHAR(48) NOT NULL,
  scope VARCHAR(120) NOT NULL,
  reason VARCHAR(255) NULL,
  uses INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_grant_user (user_id, expires_at),
  CONSTRAINT fk_grant_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Límite de peticiones por ventana de tiempo (por IP, por correo, por usuario, por acción)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket VARCHAR(120) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket, window_start),
  KEY ix_rl_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Direcciones IP bloqueadas (por la trampa, el WAF o abuso de OTP)
CREATE TABLE IF NOT EXISTS ip_blocks (
  ip VARCHAR(45) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  blocked_until DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (ip),
  KEY ix_ipb_until (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eventos de seguridad. TRAMPA = intento de leer código, configuración o respaldos.
CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(24) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  http_method VARCHAR(8) NOT NULL DEFAULT '',
  path VARCHAR(255) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  detail TEXT NULL,
  notified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_secev_created (created_at),
  KEY ix_secev_ip (ip, created_at),
  KEY ix_secev_org (org_id, created_at),
  CONSTRAINT ck_secev_sev CHECK (severity IN ('BAJA','MEDIA','ALTA','CRITICA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Revisiones de integridad de los archivos publicados (contra un manifiesto firmado)
CREATE TABLE IF NOT EXISTS integrity_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  checked_at DATETIME(3) NOT NULL,
  files_total INT UNSIGNED NOT NULL DEFAULT 0,
  changed_count INT UNSIGNED NOT NULL DEFAULT 0,
  added_count INT UNSIGNED NOT NULL DEFAULT 0,
  removed_count INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(8) NOT NULL,
  detail MEDIUMTEXT NULL,
  PRIMARY KEY (id),
  KEY ix_integ_checked (checked_at),
  CONSTRAINT ck_integ_status CHECK (status IN ('OK','ALERTA','ERROR'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
