-- 001 · Esquema inicial (MySQL / MariaDB 10.11+). Equivale a sqlite/001_esquema_inicial.sql.
-- Identificadores, hashes y tokens con comparación exacta (ascii_bin / utf8mb4_bin), como en SQLite.
-- Fechas en UTC como DATETIME ('AAAA-MM-DD HH:MM:SS'), igual que las escribe la aplicación.

CREATE TABLE IF NOT EXISTS contratos (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uid                VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sub_cuenta         VARCHAR(100) NOT NULL,
    clave_webhook      VARCHAR(255) COLLATE utf8mb4_bin NULL,
    cliente_nombre     VARCHAR(255) NOT NULL,
    cliente_cedula     VARCHAR(50) NOT NULL,
    cliente_telefono   VARCHAR(50) NULL,
    cliente_correo     VARCHAR(255) NOT NULL,
    responsable_nombre VARCHAR(255) NULL,
    responsable_correo VARCHAR(255) NULL,
    creado_en          DATETIME NOT NULL,
    UNIQUE KEY uq_contratos_uid (uid),
    UNIQUE KEY uq_contratos_clave_webhook (clave_webhook),
    KEY ix_contratos_responsable (responsable_correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada versión es inmutable una vez enviada. Los cambios crean una versión nueva.
CREATE TABLE IF NOT EXISTS versiones (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    contrato_id INT UNSIGNED NOT NULL,
    numero      INT NOT NULL,
    estado      VARCHAR(10) NOT NULL,
    terminos    LONGTEXT NOT NULL,
    creado_en   DATETIME NOT NULL,
    enviado_en  DATETIME NULL,
    firmado_en  DATETIME NULL,
    UNIQUE KEY uq_versiones_numero (contrato_id, numero),
    CONSTRAINT ck_versiones_estado CHECK (estado IN ('BORRADOR','ENVIADO','FIRMADO','REVOCADA')),
    CONSTRAINT fk_versiones_contrato FOREIGN KEY (contrato_id) REFERENCES contratos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlaces de firma: se guarda solo el hash del token, nunca el token.
CREATE TABLE IF NOT EXISTS tokens_firma (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id  INT UNSIGNED NOT NULL,
    hash        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expira_en   DATETIME NOT NULL,
    usado_en    DATETIME NULL,
    revocado_en DATETIME NULL,
    UNIQUE KEY uq_tokens_firma_hash (hash),
    CONSTRAINT fk_tokens_firma_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Firma dibujada y datos de evidencia, una por versión firmada.
CREATE TABLE IF NOT EXISTS firmas (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id      INT UNSIGNED NOT NULL,
    firma_png       LONGBLOB NOT NULL,
    nombre_firmante VARCHAR(255) NOT NULL,
    ip              VARCHAR(64) NOT NULL,
    user_agent      TEXT NOT NULL,
    firmado_en      DATETIME NOT NULL,
    hash_documento  VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY uq_firmas_version (version_id),
    CONSTRAINT fk_firmas_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de todo lo que pasa con un contrato.
CREATE TABLE IF NOT EXISTS eventos (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    contrato_id INT UNSIGNED NOT NULL,
    version_id  INT UNSIGNED NULL,
    tipo        VARCHAR(50) NOT NULL,
    detalle     LONGTEXT NULL,
    creado_en   DATETIME NOT NULL,
    KEY ix_eventos_version (version_id),
    CONSTRAINT fk_eventos_contrato FOREIGN KEY (contrato_id) REFERENCES contratos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personas que usan el sistema (staff). El acceso se da por invitación del administrador.
CREATE TABLE IF NOT EXISTS usuarios (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    correo            VARCHAR(255) NOT NULL,
    nombre            VARCHAR(255) NOT NULL,
    clave_hash        VARCHAR(255) NOT NULL,
    rol               VARCHAR(10) NOT NULL,
    activo            TINYINT(1) NOT NULL DEFAULT 1,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta   DATETIME NULL,
    creado_en         DATETIME NOT NULL,
    UNIQUE KEY uq_usuarios_correo (correo),
    CONSTRAINT ck_usuarios_rol CHECK (rol IN ('ADMIN','REMITENTE','VISOR'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones: se guarda solo el hash del token de la cookie.
CREATE TABLE IF NOT EXISTS sesiones (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    hash       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expira_en  DATETIME NOT NULL,
    creado_en  DATETIME NOT NULL,
    UNIQUE KEY uq_sesiones_hash (hash),
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PDF generado al enviar cada versión. Nunca se sobrescribe: una versión, un archivo.
CREATE TABLE IF NOT EXISTS documentos (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id INT UNSIGNED NOT NULL,
    ruta       VARCHAR(1024) NOT NULL,
    sha256     VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en  DATETIME NOT NULL,
    UNIQUE KEY uq_documentos_version (version_id),
    CONSTRAINT fk_documentos_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlace de firma cifrado: permite mostrarlo otra vez en el panel mientras siga vigente.
CREATE TABLE IF NOT EXISTS enlaces_firma (
    version_id    INT UNSIGNED NOT NULL PRIMARY KEY,
    token_cifrado TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en     DATETIME NOT NULL,
    CONSTRAINT fk_enlaces_firma_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlaces de descarga del convenio firmado (se envían por correo al cliente). Solo se guarda el hash.
CREATE TABLE IF NOT EXISTS descargas_firma (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id INT UNSIGNED NOT NULL,
    hash       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expira_en  DATETIME NOT NULL,
    creado_en  DATETIME NOT NULL,
    UNIQUE KEY uq_descargas_firma_hash (hash),
    CONSTRAINT fk_descargas_firma_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Convenio con la firma del cliente. Un PDF por versión firmada (el enviado queda en documentos).
CREATE TABLE IF NOT EXISTS documentos_firmados (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id INT UNSIGNED NOT NULL,
    ruta       VARCHAR(1024) NOT NULL,
    sha256     VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en  DATETIME NOT NULL,
    UNIQUE KEY uq_documentos_firmados_version (version_id),
    CONSTRAINT fk_documentos_firmados_version FOREIGN KEY (version_id) REFERENCES versiones (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
