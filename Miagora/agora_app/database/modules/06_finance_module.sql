-- =====================================================================
-- Agora Digital App · v11 · Módulo 06: finanzas (cobros multimoneda)
-- Un cobro registrado es un dato procesado: no se edita ni se borra. Solo se REVIERTE
-- (con verificación OTP y motivo), y la referencia queda libre para registrarlo bien.
-- Requiere: 05_billing_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(40) NOT NULL,
  document_id BIGINT UNSIGNED NULL,
  invoice_ref VARCHAR(40) NOT NULL,
  paid_on DATE NOT NULL,
  period CHAR(7) NOT NULL,
  method VARCHAR(10) NOT NULL,
  currency VARCHAR(4) NOT NULL,
  amount_cents BIGINT NOT NULL,
  usd_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  rate DECIMAL(18,6) NULL,
  rate_type VARCHAR(10) NULL,
  rate_bcv DECIMAL(18,6) NULL,
  fx_quote_id CHAR(26) NULL,
  igtf_cents BIGINT NOT NULL DEFAULT 0,
  reference VARCHAR(80) NOT NULL,
  reference_active VARCHAR(80) NULL,
  payer VARCHAR(160) NULL,
  settle TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(10) NOT NULL DEFAULT 'REGISTRADO',
  payload TEXT NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  reverted_by BIGINT UNSIGNED NULL,
  reverted_at DATETIME(3) NULL,
  revert_reason VARCHAR(400) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_app (org_id, app_id),
  UNIQUE KEY uq_pay_ref_active (org_id, reference_active),
  KEY ix_pay_period (org_id, period),
  KEY ix_pay_doc (org_id, document_id),
  KEY ix_pay_invoice (org_id, invoice_ref),
  CONSTRAINT fk_pay_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_doc FOREIGN KEY (document_id) REFERENCES fiscal_documents (id) ON DELETE RESTRICT,
  CONSTRAINT ck_pay_method CHECK (method IN ('BINANCE','PAYPAL','ZELLE','CASH','VES','RET_IVA')),
  CONSTRAINT ck_pay_currency CHECK (currency IN ('USD','USDT','VES','EUR')),
  CONSTRAINT ck_pay_status CHECK (status IN ('REGISTRADO','REVERTIDO')),
  CONSTRAINT ck_pay_amounts CHECK (amount_cents > 0 AND usd_cents > 0 AND fee_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
DROP TRIGGER IF EXISTS trg_pay_before_update$$
CREATE TRIGGER trg_pay_before_update BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  IF NOT (OLD.org_id <=> NEW.org_id) OR NOT (OLD.app_id <=> NEW.app_id) OR NOT (OLD.invoice_ref <=> NEW.invoice_ref)
    OR NOT (OLD.paid_on <=> NEW.paid_on) OR NOT (OLD.method <=> NEW.method) OR NOT (OLD.currency <=> NEW.currency)
    OR NOT (OLD.amount_cents <=> NEW.amount_cents) OR NOT (OLD.usd_cents <=> NEW.usd_cents) OR NOT (OLD.fee_cents <=> NEW.fee_cents)
    OR NOT (OLD.rate <=> NEW.rate) OR NOT (OLD.reference <=> NEW.reference) OR NOT (OLD.igtf_cents <=> NEW.igtf_cents)
    OR NOT (OLD.payload <=> NEW.payload) OR NOT (OLD.created_at <=> NEW.created_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COBRO_INMUTABLE';
  END IF;
  IF OLD.status = 'REVERTIDO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COBRO_INMUTABLE';
  END IF;
END$$
DROP TRIGGER IF EXISTS trg_pay_before_delete$$
CREATE TRIGGER trg_pay_before_delete BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COBRO_INMUTABLE';
END$$
DELIMITER ;
