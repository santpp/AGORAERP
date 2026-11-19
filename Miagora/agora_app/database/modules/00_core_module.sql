-- =====================================================================
-- Agora Digital App · v11 · Módulo 00: núcleo (empresas, ajustes, correlativos)
-- MySQL 8.0+ / MariaDB 10.6+ · InnoDB · utf8mb4 · todas las horas en UTC
-- Se puede importar en phpMyAdmin (hPanel) o con: php agora_app/database/migrate.php
-- =====================================================================
SET NAMES utf8mb4;

-- Control de versiones del esquema (lo llena el migrador)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Empresas (multiempresa: cada pyme cliente de Agora es una organización aislada)
CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(26) NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  plan VARCHAR(12) NOT NULL DEFAULT 'BRONCE',
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVA',
  timezone VARCHAR(40) NOT NULL DEFAULT 'America/Caracas',
  max_users INT UNSIGNED NOT NULL DEFAULT 3,
  data_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_uid (uid),
  UNIQUE KEY uq_org_slug (slug),
  CONSTRAINT ck_org_status CHECK (status IN ('ACTIVA','SUSPENDIDA','CERRADA')),
  CONSTRAINT ck_org_plan CHECK (plan IN ('BRONCE','PLATA','ORO','DIAMANTE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajustes por empresa (clave → valor JSON)
CREATE TABLE IF NOT EXISTS org_settings (
  org_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(64) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (org_id, setting_key),
  CONSTRAINT fk_orgset_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Correlativos por empresa, tipo de documento y serie (FAC, NC, ND, REC).
-- Se incrementan dentro de la misma transacción que emite el documento: sin huecos ni duplicados.
CREATE TABLE IF NOT EXISTS document_sequences (
  org_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(8) NOT NULL,
  series VARCHAR(4) NOT NULL DEFAULT '',
  last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (org_id, doc_type, series),
  CONSTRAINT fk_seq_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
