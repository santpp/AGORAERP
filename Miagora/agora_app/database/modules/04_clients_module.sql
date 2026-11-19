-- =====================================================================
-- Agora Digital App · v11 · Módulo 04: clientes (datos fiscales del adquirente)
-- La app trabaja con su lista de clientes; el servidor mantiene esta tabla normalizada
-- (RIF, razón social, domicilio) para facturar, buscar e informar.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS clients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(40) NOT NULL,
  code VARCHAR(40) NULL,
  name VARCHAR(200) NOT NULL,
  rif VARCHAR(20) NULL,
  rif_norm VARCHAR(20) NULL,
  address VARCHAR(400) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  sector VARCHAR(80) NULL,
  special_taxpayer TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVO',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_app (org_id, app_id),
  KEY ix_client_rif (org_id, rif_norm),
  KEY ix_client_name (org_id, name),
  CONSTRAINT fk_client_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_client_status CHECK (status IN ('ACTIVO','PAUSADO','BAJA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
