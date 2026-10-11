-- =============================================================================
-- 01 · MÓDULO CAPTACIÓN — reservas del diagnóstico de ventas gratis (prospectos)
-- Usado por: api/diagnostico.php (INSERT) y api/disponibilidad.php (SELECT)
-- Todas las consultas de la API son preparadas (PDO, sin emulación).
-- =============================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS diagnosticos (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  objetivo       ENUM('crm','finanzas','ambos') NOT NULL,          -- "¿Qué quieres mejorar primero?"
  nombre         VARCHAR(80)   NOT NULL,
  telefono       VARCHAR(20)   NOT NULL,                           -- WhatsApp
  equipo         ENUM('1-3','4-10','11-20','21+') NOT NULL,
  inicio         DATETIME      NOT NULL,                           -- hora UTC−4
  empresa        VARCHAR(80)   NULL,
  correo         VARCHAR(120)  NULL,
  mensaje        VARCHAR(500)  NULL,
  plan           ENUM('Bronce','Plata','Oro','Diamante') NULL,     -- plan elegido en la sección de precios
  pagina         VARCHAR(300)  NULL,                               -- URL de llegada
  estado         ENUM('nuevo','confirmado','atendido','no_asistio','cancelado') NOT NULL DEFAULT 'nuevo',
  utm_source     VARCHAR(60)   NULL,                               -- atribución de campañas
  utm_medium     VARCHAR(60)   NULL,
  utm_campaign   VARCHAR(60)   NULL,
  ip_hash        CHAR(64)      NULL,                               -- HMAC de la IP, nunca la IP en claro
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
  -- Columna generada: el horario solo "ocupa" si la reserva no está cancelada.
  inicio_activo  DATETIME AS (IF(estado = 'cancelado', NULL, inicio)) STORED,

  UNIQUE KEY uq_horario_activo (inicio_activo),                    -- cero dobles reservas, sin bloqueos
  KEY ix_diag_estado_inicio (estado, inicio),                      -- agenda del equipo comercial
  KEY ix_diag_creado (creado_en),                                  -- reportes por fecha
  KEY ix_diag_telefono (telefono),                                 -- duplicados y seguimiento
  KEY ix_diag_plan (plan, creado_en),                              -- interés por plan
  KEY ix_diag_campana (utm_source, utm_campaign, creado_en),       -- rendimiento por campaña

  CONSTRAINT ck_diag_telefono CHECK (telefono REGEXP '^[+0-9][0-9 ()-]{6,19}$'),
  CONSTRAINT ck_diag_correo   CHECK (correo IS NULL OR correo LIKE '%_@_%._%'),
  CONSTRAINT ck_diag_hora     CHECK (MINUTE(inicio) = 0 AND SECOND(inicio) = 0),
  CONSTRAINT ck_diag_nombre   CHECK (CHAR_LENGTH(nombre) >= 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ¿Vienes de la v4? Migración sin perder datos (ejecutar una sola vez):
-- ALTER TABLE diagnosticos
--   CHANGE interes objetivo ENUM('crm','finanzas','ambos') NOT NULL,
--   MODIFY empresa VARCHAR(80) NULL,
--   ADD COLUMN plan ENUM('Bronce','Plata','Oro','Diamante') NULL AFTER mensaje,
--   ADD COLUMN pagina VARCHAR(300) NULL AFTER plan,
--   DROP CHECK ck_diag_nombre,
--   ADD CONSTRAINT ck_diag_nombre CHECK (CHAR_LENGTH(nombre) >= 2),
--   ADD KEY ix_diag_plan (plan, creado_en);
