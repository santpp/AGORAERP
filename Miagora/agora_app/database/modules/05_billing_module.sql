-- =====================================================================
-- Agora Digital App · v11 · Módulo 05: facturación fiscal (Venezuela)
-- Base normativa: Providencia SNAT/2011/00071 (arts. 13, 23 y 44) y Providencia
-- SNAT/2024/000102 (medios digitales, G.O. 43.032 del 19/12/2024).
--  · Numeración consecutiva y única por tipo y serie: se asigna al EMITIR (los borradores no consumen número).
--  · Número de control: lo asigna la imprenta digital o sale del rango de formas libres autorizado
--    (dos dígitos + secuencial de hasta 8 dígitos, art. 44).
--  · Un documento emitido no se modifica: se anula (conservando su número) o se corrige con nota de crédito o débito
--    que cita número, fecha y monto de la factura afectada (art. 23).
--  · Operaciones en divisas: monto en moneda extranjera + tasa BCV + equivalente en bolívares (art. 13, num. 14).
-- Requiere: 04_clients_module.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Datos fiscales del emisor (uno por empresa)
CREATE TABLE IF NOT EXISTS fiscal_profiles (
  org_id BIGINT UNSIGNED NOT NULL,
  legal_name VARCHAR(200) NOT NULL,
  rif VARCHAR(20) NOT NULL,
  fiscal_address VARCHAR(400) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  special_taxpayer TINYINT(1) NOT NULL DEFAULT 0,
  issuance_mode VARCHAR(16) NOT NULL DEFAULT 'IMPRENTA_DIGITAL',
  series VARCHAR(4) NOT NULL DEFAULT '',
  printer_name VARCHAR(200) NULL,
  printer_rif VARCHAR(20) NULL,
  printer_authorization VARCHAR(80) NULL,
  printer_authorization_date DATE NULL,
  iva_general_bp INT UNSIGNED NOT NULL DEFAULT 1600,
  iva_reduced_bp INT UNSIGNED NOT NULL DEFAULT 800,
  iva_luxury_bp INT UNSIGNED NOT NULL DEFAULT 1500,
  igtf_bp INT UNSIGNED NOT NULL DEFAULT 300,
  igtf_enabled TINYINT(1) NOT NULL DEFAULT 0,
  legends TEXT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (org_id),
  CONSTRAINT fk_fprof_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_fprof_mode CHECK (issuance_mode IN ('IMPRENTA_DIGITAL','FORMA_LIBRE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rangos de números de control de formas libres entregados por la imprenta autorizada
CREATE TABLE IF NOT EXISTS control_number_ranges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  series VARCHAR(4) NOT NULL DEFAULT '',
  prefix CHAR(2) NOT NULL DEFAULT '00',
  range_from BIGINT UNSIGNED NOT NULL,
  range_to BIGINT UNSIGNED NOT NULL,
  next_value BIGINT UNSIGNED NOT NULL,
  printer_name VARCHAR(200) NOT NULL,
  printer_rif VARCHAR(20) NOT NULL,
  printer_authorization VARCHAR(80) NOT NULL,
  assigned_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
  created_at DATETIME(3) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_ctrl_org (org_id, series, status),
  CONSTRAINT fk_ctrl_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_ctrl_range CHECK (range_from >= 1 AND range_to >= range_from AND range_to <= 99999999),
  CONSTRAINT ck_ctrl_status CHECK (status IN ('ACTIVO','AGOTADO','ANULADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Facturas (FAC), notas de crédito (NC) y notas de débito (ND)
CREATE TABLE IF NOT EXISTS fiscal_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(26) NOT NULL,
  org_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(3) NOT NULL,
  series VARCHAR(4) NOT NULL DEFAULT '',
  number BIGINT UNSIGNED NULL,
  number_text VARCHAR(16) NULL,
  control_number VARCHAR(16) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'BORRADOR',
  legacy TINYINT(1) NOT NULL DEFAULT 0,
  issue_date DATE NULL,
  issue_time CHAR(8) NULL,
  due_date DATE NULL,
  currency VARCHAR(4) NOT NULL DEFAULT 'USD',
  rate_bcv DECIMAL(18,6) NULL,
  rate_bcv_date DATE NULL,
  client_id BIGINT UNSIGNED NULL,
  client_app_id VARCHAR(40) NULL,
  client_name VARCHAR(200) NOT NULL DEFAULT '',
  client_rif VARCHAR(20) NOT NULL DEFAULT '',
  client_address VARCHAR(400) NOT NULL DEFAULT '',
  client_email VARCHAR(190) NULL,
  client_phone VARCHAR(40) NULL,
  payment_terms VARCHAR(120) NULL,
  foreign_payment TINYINT(1) NOT NULL DEFAULT 0,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  exempt_cents BIGINT NOT NULL DEFAULT 0,
  base_general_cents BIGINT NOT NULL DEFAULT 0,
  base_reduced_cents BIGINT NOT NULL DEFAULT 0,
  base_luxury_cents BIGINT NOT NULL DEFAULT 0,
  iva_general_cents BIGINT NOT NULL DEFAULT 0,
  iva_reduced_cents BIGINT NOT NULL DEFAULT 0,
  iva_luxury_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  total_bs_cents BIGINT NULL,
  igtf_base_cents BIGINT NOT NULL DEFAULT 0,
  igtf_cents BIGINT NOT NULL DEFAULT 0,
  control_assigned_at DATETIME(3) NULL,
  affected_document_id BIGINT UNSIGNED NULL,
  affected_number VARCHAR(16) NULL,
  affected_date DATE NULL,
  affected_total_cents BIGINT NULL,
  reason VARCHAR(400) NULL,
  notes VARCHAR(600) NULL,
  fiscal_snapshot MEDIUMTEXT NULL,
  representation_html MEDIUMTEXT NULL,
  hash CHAR(64) NULL,
  prev_hash CHAR(64) NULL,
  printer_reference VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  emitted_by BIGINT UNSIGNED NULL,
  emitted_at DATETIME(3) NULL,
  annulled_by BIGINT UNSIGNED NULL,
  annulled_at DATETIME(3) NULL,
  annul_reason VARCHAR(400) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fdoc_uid (uid),
  UNIQUE KEY uq_fdoc_number (org_id, doc_type, series, number),
  UNIQUE KEY uq_fdoc_control (org_id, control_number),
  KEY ix_fdoc_status_date (org_id, status, issue_date),
  KEY ix_fdoc_client (org_id, client_app_id),
  KEY ix_fdoc_affected (org_id, affected_document_id),
  CONSTRAINT fk_fdoc_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_fdoc_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
  CONSTRAINT fk_fdoc_affected FOREIGN KEY (affected_document_id) REFERENCES fiscal_documents (id) ON DELETE RESTRICT,
  CONSTRAINT ck_fdoc_type CHECK (doc_type IN ('FAC','NC','ND')),
  CONSTRAINT ck_fdoc_status CHECK (status IN ('BORRADOR','EMITIDA','ANULADA')),
  CONSTRAINT ck_fdoc_currency CHECK (currency IN ('USD','VES','EUR')),
  CONSTRAINT ck_fdoc_number CHECK (status = 'BORRADOR' OR number IS NOT NULL),
  CONSTRAINT ck_fdoc_note_ref CHECK (doc_type = 'FAC' OR status = 'BORRADOR' OR affected_number IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Renglones del documento. Cantidad en milésimas y montos en céntimos (sin errores de redondeo).
CREATE TABLE IF NOT EXISTS fiscal_document_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  product_code VARCHAR(60) NULL,
  description VARCHAR(500) NOT NULL,
  quantity_milli BIGINT NOT NULL DEFAULT 1000,
  unit_price_cents BIGINT NOT NULL,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  tax_code CHAR(1) NOT NULL DEFAULT 'G',
  base_cents BIGINT NOT NULL,
  iva_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL,
  recurring TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fline_doc (document_id, line_no),
  CONSTRAINT fk_fline_doc FOREIGN KEY (document_id) REFERENCES fiscal_documents (id) ON DELETE CASCADE,
  CONSTRAINT ck_fline_tax CHECK (tax_code IN ('G','R','A','E')),
  CONSTRAINT ck_fline_qty CHECK (quantity_milli > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inmutabilidad en la propia base de datos (aunque alguien entre por phpMyAdmin)
DELIMITER $$
DROP TRIGGER IF EXISTS trg_fdoc_before_update$$
CREATE TRIGGER trg_fdoc_before_update BEFORE UPDATE ON fiscal_documents FOR EACH ROW
BEGIN
  IF OLD.status <> 'BORRADOR' AND (
       NOT (OLD.org_id <=> NEW.org_id) OR NOT (OLD.doc_type <=> NEW.doc_type) OR NOT (OLD.series <=> NEW.series)
    OR NOT (OLD.number <=> NEW.number) OR NOT (OLD.number_text <=> NEW.number_text)
    OR NOT (OLD.issue_date <=> NEW.issue_date) OR NOT (OLD.issue_time <=> NEW.issue_time) OR NOT (OLD.due_date <=> NEW.due_date)
    OR NOT (OLD.currency <=> NEW.currency) OR NOT (OLD.rate_bcv <=> NEW.rate_bcv) OR NOT (OLD.rate_bcv_date <=> NEW.rate_bcv_date)
    OR NOT (OLD.client_name <=> NEW.client_name) OR NOT (OLD.client_rif <=> NEW.client_rif) OR NOT (OLD.client_address <=> NEW.client_address)
    OR NOT (OLD.subtotal_cents <=> NEW.subtotal_cents) OR NOT (OLD.exempt_cents <=> NEW.exempt_cents)
    OR NOT (OLD.base_general_cents <=> NEW.base_general_cents) OR NOT (OLD.base_reduced_cents <=> NEW.base_reduced_cents) OR NOT (OLD.base_luxury_cents <=> NEW.base_luxury_cents)
    OR NOT (OLD.iva_general_cents <=> NEW.iva_general_cents) OR NOT (OLD.iva_reduced_cents <=> NEW.iva_reduced_cents) OR NOT (OLD.iva_luxury_cents <=> NEW.iva_luxury_cents)
    OR NOT (OLD.total_cents <=> NEW.total_cents) OR NOT (OLD.total_bs_cents <=> NEW.total_bs_cents)
    OR NOT (OLD.igtf_base_cents <=> NEW.igtf_base_cents) OR NOT (OLD.igtf_cents <=> NEW.igtf_cents)
    OR NOT (OLD.foreign_payment <=> NEW.foreign_payment) OR NOT (OLD.client_app_id <=> NEW.client_app_id)
    OR NOT (OLD.affected_document_id <=> NEW.affected_document_id) OR NOT (OLD.affected_number <=> NEW.affected_number)
    OR NOT (OLD.fiscal_snapshot <=> NEW.fiscal_snapshot) OR NOT (OLD.prev_hash <=> NEW.prev_hash)
    OR NOT (OLD.emitted_at <=> NEW.emitted_at) OR NOT (OLD.emitted_by <=> NEW.emitted_by)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
  IF OLD.status <> 'BORRADOR' AND NOT (OLD.hash <=> NEW.hash) AND NOT (OLD.control_number IS NULL AND NEW.control_number IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
  IF OLD.status <> 'BORRADOR' AND NOT (OLD.representation_html <=> NEW.representation_html) AND NOT (OLD.control_number IS NULL AND NEW.control_number IS NOT NULL) AND NOT (OLD.status = 'EMITIDA' AND NEW.status = 'ANULADA') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
  IF OLD.status <> 'BORRADOR' AND NOT (OLD.control_assigned_at <=> NEW.control_assigned_at) AND NOT (OLD.control_number IS NULL AND NEW.control_number IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
  IF OLD.control_number IS NOT NULL AND NOT (OLD.control_number <=> NEW.control_number) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NUMERO_CONTROL_INMUTABLE';
  END IF;
  IF NOT (OLD.status <=> NEW.status) AND NOT ((OLD.status = 'BORRADOR' AND NEW.status = 'EMITIDA') OR (OLD.status = 'EMITIDA' AND NEW.status = 'ANULADA')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TRANSICION_INVALIDA';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_fdoc_before_delete$$
CREATE TRIGGER trg_fdoc_before_delete BEFORE DELETE ON fiscal_documents FOR EACH ROW
BEGIN
  IF OLD.status <> 'BORRADOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_fline_before_insert$$
CREATE TRIGGER trg_fline_before_insert BEFORE INSERT ON fiscal_document_lines FOR EACH ROW
BEGIN
  IF (SELECT status FROM fiscal_documents WHERE id = NEW.document_id) <> 'BORRADOR' AND (SELECT legacy FROM fiscal_documents WHERE id = NEW.document_id) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_fline_before_update$$
CREATE TRIGGER trg_fline_before_update BEFORE UPDATE ON fiscal_document_lines FOR EACH ROW
BEGIN
  IF (SELECT status FROM fiscal_documents WHERE id = OLD.document_id) <> 'BORRADOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_fline_before_delete$$
CREATE TRIGGER trg_fline_before_delete BEFORE DELETE ON fiscal_document_lines FOR EACH ROW
BEGIN
  IF (SELECT status FROM fiscal_documents WHERE id = OLD.document_id) <> 'BORRADOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DOCUMENTO_FISCAL_INMUTABLE';
  END IF;
END$$
DELIMITER ;
