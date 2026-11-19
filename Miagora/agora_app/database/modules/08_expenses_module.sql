-- =====================================================================
-- Agora Digital App · v11 · Módulo 08: gastos (copia normalizada para informes y control)
-- La app guarda sus gastos como documento; el servidor valida cada cambio (meses cerrados)
-- y mantiene esta tabla con índices por mes y categoría.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(60) NOT NULL,
  period CHAR(7) NOT NULL,
  spent_on DATE NULL,
  category VARCHAR(40) NOT NULL,
  concept VARCHAR(200) NOT NULL DEFAULT '',
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(4) NOT NULL DEFAULT 'USD',
  payee VARCHAR(160) NULL,
  source VARCHAR(20) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exp_app (org_id, app_id),
  KEY ix_exp_period (org_id, period, category),
  CONSTRAINT fk_exp_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_exp_currency CHECK (currency IN ('USD','USDT','VES','EUR'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
