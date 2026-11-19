-- =====================================================================
-- Agora Digital App · v11 · Módulo 07: tasas de cambio (BCV y Binance P2P USDT/VES)
-- El servidor consulta las fuentes cada pocos minutos (tarea programada), guarda cada
-- lectura y publica un resumen estático (fx/actual.json) que leen todos los usuarios.
-- Las cotizaciones bloquean una tasa por operación durante unos minutos.
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Cada lectura de una fuente. BINANCE_BUY = anuncios donde se COMPRA USDT (precio que se paga en Bs);
-- BINANCE_SELL = anuncios donde se VENDE USDT (Bs que se reciben).
CREATE TABLE IF NOT EXISTS fx_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source VARCHAR(14) NOT NULL,
  rate DECIMAL(18,6) NULL,
  best DECIMAL(18,6) NULL,
  median DECIMAL(18,6) NULL,
  worst DECIMAL(18,6) NULL,
  sample_size INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(6) NOT NULL,
  error VARCHAR(255) NULL,
  detail TEXT NULL,
  fetched_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_fxs_source (source, fetched_at),
  CONSTRAINT ck_fxs_source CHECK (source IN ('BCV','BINANCE_BUY','BINANCE_SELL')),
  CONSTRAINT ck_fxs_status CHECK (status IN ('OK','ERROR'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resumen diario por fuente (hora de Venezuela): alimenta las "tasas del día" de la app
CREATE TABLE IF NOT EXISTS fx_daily (
  day DATE NOT NULL,
  source VARCHAR(14) NOT NULL,
  rate_last DECIMAL(18,6) NOT NULL,
  rate_min DECIMAL(18,6) NOT NULL,
  rate_max DECIMAL(18,6) NOT NULL,
  rate_avg DECIMAL(18,6) NOT NULL,
  samples INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (day, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cotizaciones bloqueadas: la tasa elegida por la política para una operación concreta
CREATE TABLE IF NOT EXISTS fx_quotes (
  id CHAR(26) NOT NULL,
  org_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  operation VARCHAR(12) NOT NULL,
  amount_usd_cents BIGINT NULL,
  rate DECIMAL(18,6) NOT NULL,
  source VARCHAR(14) NOT NULL,
  policy VARCHAR(60) NOT NULL,
  candidates TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  used_entity VARCHAR(40) NULL,
  used_entity_id VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY ix_fxq_org (org_id, created_at),
  CONSTRAINT fk_fxq_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT ck_fxq_op CHECK (operation IN ('COBRO_BS','VENTA_USDT','COMPRA_USDT','FISCAL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
