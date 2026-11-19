-- =====================================================================
-- Agora Digital App · v11 · Módulo 12: respaldos ("memoria de respaldo")
-- Registro de cada copia: base de datos y archivos críticos, comprimida y cifrada
-- (XChaCha20-Poly1305 con libsodium), rotación diaria/semanal/mensual y copia externa opcional.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS backup_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind VARCHAR(8) NOT NULL,
  file_name VARCHAR(200) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  sha256 CHAR(64) NULL,
  tables_count INT UNSIGNED NULL,
  rows_count BIGINT UNSIGNED NULL,
  offsite_status VARCHAR(10) NOT NULL DEFAULT 'NO',
  status VARCHAR(6) NOT NULL,
  error TEXT NULL,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_bkp_started (started_at),
  CONSTRAINT ck_bkp_kind CHECK (kind IN ('DIARIO','SEMANAL','MENSUAL','MANUAL')),
  CONSTRAINT ck_bkp_status CHECK (status IN ('OK','ERROR','EN_CURSO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
