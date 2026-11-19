-- =====================================================================
-- Agora Digital App · v11 · Módulo 09: cierre de mes
-- Un mes CERRADO no admite cambios en sus datos sin una verificación OTP vigente.
-- Reabrirlo exige Superadministrador + OTP + motivo, y avisa por correo a los administradores.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS accounting_periods (
  org_id BIGINT UNSIGNED NOT NULL,
  period CHAR(7) NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'ABIERTO',
  closed_at DATETIME(3) NULL,
  closed_by BIGINT UNSIGNED NULL,
  close_snapshot TEXT NULL,
  reopened_at DATETIME(3) NULL,
  reopened_by BIGINT UNSIGNED NULL,
  reopen_reason VARCHAR(400) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (org_id, period),
  KEY ix_aper_status (org_id, status),
  CONSTRAINT fk_aper_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_aper_status CHECK (status IN ('ABIERTO','CERRADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
