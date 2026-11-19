-- =====================================================================
-- Agora Digital App · v11 · Módulo 03: auditoría (solo se agrega, nunca se edita ni se borra)
-- Cada registro lleva un HMAC-SHA256 encadenado al anterior de la misma empresa
-- (clave secreta en el .env del servidor): cualquier alteración rompe la cadena.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  user_email VARCHAR(190) NOT NULL DEFAULT '',
  role VARCHAR(12) NOT NULL DEFAULT '',
  ip VARCHAR(45) NOT NULL DEFAULT '',
  module VARCHAR(40) NOT NULL,
  action VARCHAR(500) NOT NULL,
  entity VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  detail MEDIUMTEXT NULL,
  origin VARCHAR(8) NOT NULL DEFAULT 'SERVIDOR',
  grant_id CHAR(64) NULL,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_org (org_id, id),
  KEY ix_audit_entity (org_id, entity, entity_id),
  KEY ix_audit_created (created_at),
  CONSTRAINT ck_audit_origin CHECK (origin IN ('SERVIDOR','CLIENTE','SISTEMA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Último eslabón de la cadena por empresa (org_id 0 = eventos de la plataforma).
-- Se bloquea la fila al escribir para que dos peticiones simultáneas no bifurquen la cadena.
CREATE TABLE IF NOT EXISTS audit_heads (
  org_id BIGINT UNSIGNED NOT NULL,
  last_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_hash CHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
DROP TRIGGER IF EXISTS trg_audit_no_update$$
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDITORIA_INMUTABLE';
END$$
DROP TRIGGER IF EXISTS trg_audit_no_delete$$
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDITORIA_INMUTABLE';
END$$
DELIMITER ;
