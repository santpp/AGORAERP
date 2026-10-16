-- Contratos ASOCIM · esquema de la base (SQLite en desarrollo, MySQL en producción)

CREATE TABLE IF NOT EXISTS contratos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    uid             TEXT NOT NULL UNIQUE,
    sub_cuenta      TEXT NOT NULL,
    clave_webhook   TEXT UNIQUE,
    cliente_nombre  TEXT NOT NULL,
    cliente_cedula  TEXT NOT NULL,
    cliente_telefono TEXT,
    cliente_correo  TEXT NOT NULL,
    responsable_nombre TEXT,
    responsable_correo TEXT,
    creado_en       TEXT NOT NULL
);

-- Cada versión es inmutable una vez enviada. Los cambios crean una versión nueva.
CREATE TABLE IF NOT EXISTS versiones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id),
    numero      INTEGER NOT NULL,
    estado      TEXT NOT NULL CHECK (estado IN ('BORRADOR','ENVIADO','FIRMADO','REVOCADA')),
    terminos    TEXT NOT NULL,            -- JSON con los términos del contrato
    creado_en   TEXT NOT NULL,
    enviado_en  TEXT,
    firmado_en  TEXT,
    UNIQUE (contrato_id, numero)
);

-- Enlaces de firma: se guarda solo el hash del token, nunca el token.
CREATE TABLE IF NOT EXISTS tokens_firma (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id  INTEGER NOT NULL REFERENCES versiones(id),
    hash        TEXT NOT NULL UNIQUE,
    expira_en   TEXT NOT NULL,
    usado_en    TEXT,
    revocado_en TEXT
);

-- Firma dibujada y datos de evidencia, una por versión firmada.
CREATE TABLE IF NOT EXISTS firmas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id      INTEGER NOT NULL UNIQUE REFERENCES versiones(id),
    firma_png       BLOB NOT NULL,
    nombre_firmante TEXT NOT NULL,
    ip              TEXT NOT NULL,
    user_agent      TEXT NOT NULL,
    firmado_en      TEXT NOT NULL,
    hash_documento  TEXT NOT NULL
);

-- Historial de todo lo que pasa con un contrato.
CREATE TABLE IF NOT EXISTS eventos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id),
    version_id  INTEGER,
    tipo        TEXT NOT NULL,
    detalle     TEXT,
    creado_en   TEXT NOT NULL
);

-- Personas que usan el sistema (staff). El acceso se da por invitación del administrador.
CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    correo        TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    clave_hash    TEXT NOT NULL,
    rol           TEXT NOT NULL CHECK (rol IN ('ADMIN','REMITENTE','VISOR')),
    activo        INTEGER NOT NULL DEFAULT 1,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TEXT,
    creado_en     TEXT NOT NULL
);

-- Sesiones: se guarda solo el hash del token de la cookie.
CREATE TABLE IF NOT EXISTS sesiones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    hash        TEXT NOT NULL UNIQUE,
    expira_en   TEXT NOT NULL,
    creado_en   TEXT NOT NULL
);

-- PDF generado al enviar cada versión. Nunca se sobrescribe: una versión, un archivo.
CREATE TABLE IF NOT EXISTS documentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id  INTEGER NOT NULL UNIQUE REFERENCES versiones(id),
    ruta        TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    creado_en   TEXT NOT NULL
);

-- Convenio con la firma del cliente. Un PDF por versión firmada (el enviado queda en documentos).
CREATE TABLE IF NOT EXISTS documentos_firmados (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id  INTEGER NOT NULL UNIQUE REFERENCES versiones(id),
    ruta        TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    creado_en   TEXT NOT NULL
);
