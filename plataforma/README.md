# Plataforma de convenios (Agora)

Versión multi-empresa del sistema de convenios de pago. Nace como copia de `contratos/` (el sistema de ASOCIM,
que sigue en producción sin cambios) y evoluciona según `docs/hoja-de-ruta.md`.

- **Dominio de trabajo:** `tests.agoradigital.app` (ver `docs/entorno-pruebas.md`).
- **Espacio de nombres PHP:** `Agora\Plataforma`.
- **Estado:** fase 1 en curso. Hecho: MySQL/MariaDB, migraciones e integración continua (A0 a A2). Pendiente: A3 a A6.
- **Integración continua:** `.github/workflows/plataforma.yml` en cada envío (PHP en SQLite y MariaDB, PDF, panel).
- **Decisiones:** `docs/decisiones/` (D-001 modelo mixto, D-002 calibración manual de PDF).

## Estructura
| Carpeta | Qué hay |
|---|---|
| `src/` | Backend PHP (API, servicios, cálculo, correo, integración GHL, persistencia y migraciones) |
| `public/` | Lo que va a `public_html`: `index.php` (API), `firmar.php`, `.htaccess`, logos y `panel/` (build de Angular) |
| `frontend/` | Código del panel (Angular 21 + Material) |
| `tools/pdf/` | Motor de PDF y un formato por contrato de cada empresa (`formatos/`), con calibración y regresión |
| `scripts/` | Migraciones, traspaso SQLite → MySQL, respaldo y simulacro de restauración |
| `plantillas/` | PDF originales de las empresas (no van a Git) y fuentes |
| `docs/` | Plan, requisitos, decisiones, guías de operación |

## Comprobar antes de cada cambio
```
php tests/run.php                                   # pruebas en SQLite
CONTRATOS_PRUEBAS_BD='mysql:host=localhost;dbname=<base_de_pruebas>;charset=utf8mb4' \
CONTRATOS_PRUEBAS_BD_USUARIO=<u> CONTRATOS_PRUEBAS_BD_CLAVE=<c> php tests/run.php   # en MySQL/MariaDB
python3 tools/pdf/regresion.py                      # PDF de cada formato frente a lo aprobado
```

## Construir el panel
```
cd frontend && npm ci
npx ng build --configuration production --base-href / --output-path ../public/panel --delete-output-path
# luego mover public/panel/browser/* a public/panel/ y renombrar index.html a panel.html
```
