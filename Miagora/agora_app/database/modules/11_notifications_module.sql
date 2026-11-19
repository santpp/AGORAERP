-- =====================================================================
-- Agora Digital App · v11 · Módulo 11: notificaciones (correo y WhatsApp)
-- Cola de salida con reintentos. Los códigos OTP se envían al instante y quedan aquí solo
-- como registro (sin el código: se guarda el mensaje con el código oculto).
-- Requiere: 00_core_module.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NULL,
  channel VARCHAR(10) NOT NULL,
  destination VARCHAR(190) NOT NULL,
  subject VARCHAR(200) NULL,
  body MEDIUMTEXT NOT NULL,
  template VARCHAR(40) NOT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 5,
  status VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  send_after DATETIME(3) NOT NULL,
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_outbox_status (status, send_after),
  CONSTRAINT ck_outbox_channel CHECK (channel IN ('EMAIL','WHATSAPP')),
  CONSTRAINT ck_outbox_status CHECK (status IN ('PENDIENTE','ENVIADO','FALLIDO','REGISTRO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
