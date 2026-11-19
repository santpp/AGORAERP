-- =====================================================================
-- Agora Digital App · v11 · Módulo 01: usuarios, roles, contactos, sesiones
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Personas. La clave se guarda con Argon2id (password_hash de PHP); nunca en texto.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(26) NOT NULL,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NULL,
  password_changed_at DATETIME(3) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVO',
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mfa_channel VARCHAR(10) NULL,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  last_login_ip VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uid (uid),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT ck_users_status CHECK (status IN ('ACTIVO','INVITADO','BLOQUEADO','DESACTIVADO')),
  CONSTRAINT ck_users_mfa_channel CHECK (mfa_channel IS NULL OR mfa_channel IN ('EMAIL','WHATSAPP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rol de cada persona en cada empresa
CREATE TABLE IF NOT EXISTS memberships (
  org_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(12) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVA',
  created_at DATETIME(3) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (org_id, user_id),
  KEY ix_memb_user (user_id),
  CONSTRAINT fk_memb_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_memb_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_memb_role CHECK (role IN ('SUPERADMIN','DIRECCION','ADMIN','VENTAS','CONTADOR')),
  CONSTRAINT ck_memb_status CHECK (status IN ('ACTIVA','SUSPENDIDA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canales verificados para recibir códigos (correo y WhatsApp en formato +58…)
CREATE TABLE IF NOT EXISTS user_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  channel VARCHAR(10) NOT NULL,
  contact_value VARCHAR(190) NOT NULL,
  verified_at DATETIME(3) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contact_user (user_id, channel, contact_value),
  KEY ix_contact_value (channel, contact_value),
  CONSTRAINT fk_contact_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_contact_channel CHECK (channel IN ('EMAIL','WHATSAPP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invitaciones (el enlace de un solo uso verifica el correo)
CREATE TABLE IF NOT EXISTS invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(26) NOT NULL,
  org_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL,
  role VARCHAR(12) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  invited_by BIGINT UNSIGNED NULL,
  expires_at DATETIME(3) NOT NULL,
  accepted_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inv_uid (uid),
  UNIQUE KEY uq_inv_token (token_hash),
  KEY ix_inv_org_email (org_id, email),
  CONSTRAINT fk_inv_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_inv_role CHECK (role IN ('SUPERADMIN','DIRECCION','ADMIN','VENTAS','CONTADOR'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones del servidor. La cookie lleva un token aleatorio; aquí solo se guarda su SHA-256.
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  org_id BIGINT UNSIGNED NULL,
  csrf_token CHAR(64) NOT NULL,
  mfa_passed TINYINT(1) NOT NULL DEFAULT 0,
  elevated_until DATETIME(3) NULL,
  ip VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  idle_expires_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoke_reason VARCHAR(40) NULL,
  PRIMARY KEY (id),
  KEY ix_sess_user (user_id, revoked_at),
  KEY ix_sess_exp (expires_at),
  CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Equipos de confianza ("recordar este equipo 30 días" tras pasar el OTP)
CREATE TABLE IF NOT EXISTS trusted_devices (
  id CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  ip VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_tdev_user (user_id),
  CONSTRAINT fk_tdev_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preferencias personales (tema, acento, menú, gestos, Athena)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id BIGINT UNSIGNED NOT NULL,
  pref_key VARCHAR(64) NOT NULL,
  pref_value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, pref_key),
  CONSTRAINT fk_upref_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
