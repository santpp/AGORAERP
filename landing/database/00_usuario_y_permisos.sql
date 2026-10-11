-- =============================================================================
-- Agora Digital App · Landing 3.0 — 00 · Base de datos y usuario con permisos mínimos
-- Ejecutar como ADMINISTRADOR de MySQL/MariaDB, una sola vez.
--
-- Hostinger (hosting compartido): crea la base y el usuario desde hPanel →
-- Bases de datos. hPanel no permite permisos finos por SQL; en ese caso omite
-- este archivo y ejecuta 01_captacion.sql dentro de la base creada.
-- En VPS con acceso root, usa este archivo tal cual.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS agora
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Cambia la clave por una de 32+ caracteres aleatorios
CREATE USER IF NOT EXISTS 'agora_web'@'localhost' IDENTIFIED BY 'CAMBIAR_POR_UNA_CLAVE_LARGA';

-- Mínimo privilegio: la web solo puede LEER horarios e INSERTAR reservas.
-- No puede borrar, actualizar, alterar tablas ni ver otras bases.
-- (Ejecuta este bloque DESPUÉS de crear la tabla con 01_captacion.sql.)
GRANT SELECT, INSERT ON agora.diagnosticos TO 'agora_web'@'localhost';
FLUSH PRIVILEGES;
