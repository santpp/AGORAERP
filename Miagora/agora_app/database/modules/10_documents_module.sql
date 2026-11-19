-- =====================================================================
-- Agora Digital App · v11 · Módulo 10: documentos de la app (agenda, socios, inversionistas,
-- comisiones, metas, presupuestos, matriz y demás estados) con versión y su historial.
-- El servidor aplica reglas por clave antes de guardar (meses cerrados, rangos, formato).
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS org_documents (
  org_id BIGINT UNSIGNED NOT NULL,
  doc_key VARCHAR(64) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (org_id, doc_key),
  CONSTRAINT fk_odoc_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versiones anteriores (para deshacer y para la auditoría). La limpieza conserva las últimas 50 por clave.
CREATE TABLE IF NOT EXISTS org_document_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  doc_key VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  grant_id CHAR(64) NULL,
  changed_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_odh_key (org_id, doc_key, version),
  CONSTRAINT fk_odh_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
