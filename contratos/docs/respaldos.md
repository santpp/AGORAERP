# Copias de seguridad y restauración

## Estrategia (regla 3-2-1)
Tres copias, en dos lugares distintos, una fuera del servidor. Objetivos: perder como máximo **12 horas**
de trabajo (RPO) y volver a operar en **menos de 2 horas** (RTO).

| Capa | Qué | Frecuencia | Retención | Dónde |
|---|---|---|---|---|
| 1. Respaldo de la aplicación | `scripts/respaldo.php` (base, PDF, clave, `.env`) | 2 veces al día: 03:15 y 13:15 | 14 días | `respaldos/` en el servidor |
| 2. Copia fuera del servidor | El mismo `.tar.gz`, cifrado | Cada día, tras el respaldo de las 03:15 | 30 diarios + 12 mensuales | Almacenamiento de objetos (Backblaze B2, Cloudflare R2 o Amazon S3) o Google Drive, con `rclone` |
| 3. Imagen del servidor | Instantánea completa del VPS | Semanal (la que ofrece Hostinger) | La que ofrezca el plan | Panel de Hostinger |
| Antes de cada despliegue | `scripts/respaldo.php` a mano | Cada subida de código | Hasta el siguiente despliegue correcto | `respaldos/` |

**Por qué así:**
- La capa 1 cubre errores humanos y fallos de la aplicación (restaurar en minutos).
- La capa 2 cubre la pérdida del servidor o un ataque que cifre o borre el disco: está en otro proveedor.
- La capa 3 cubre la reinstalación completa (sistema, CyberPanel, Python, permisos) sin rehacer la configuración.
- Dos respaldos al día limitan la pérdida a medio día, incluidas firmas. Las copias firmadas además llegan
  por correo al cliente y al personal, lo que permite reconstruir una firma perdida en el peor caso.

**Reglas:**
- **Cifrado fuera del servidor.** El respaldo contiene `.env`, la clave de enlaces y datos personales:
  la copia externa va cifrada (`rclone crypt` o `age`). La clave de cifrado se guarda fuera del servidor,
  en el gestor de contraseñas de Agora; sin ella, el respaldo externo no sirve.
- **Aviso si falla.** Cada respaldo correcto avisa a un servicio de vigilancia (por ejemplo, healthchecks.io);
  si no llega el aviso a su hora, el servicio envía un correo. Un respaldo que falla en silencio no existe.
- **Simulacro mensual** con `scripts/restaurar.php` sobre el respaldo más reciente de la capa 2 (el externo),
  descargado al servidor de pruebas. Registrar fecha y resultado.
- **Restauración completa trimestral** en una carpeta temporal del servidor de pruebas, comprobando que el
  panel abre los convenios. Después se borra: no se deja una copia de producción en pruebas.
- **Nunca** se restaura el `.env` de producción en `tests.agoradigital.app`: tiene el token de GHL de producción
  y el sitio de pruebas podría enviar correos reales a clientes.
- **Conservación legal.** Los convenios firmados deben conservarse el tiempo que indique el asesor legal de cada
  empresa; la retención de 12 meses de la capa 2 no sustituye ese archivo. Se recomienda un archivo anual de
  los PDF firmados, aparte de los respaldos.
- **Con MySQL (fase 1)** el script usará `mysqldump --single-transaction`; la estrategia no cambia.

### Cron recomendado
```
# Respaldos de la aplicación (03:15 y 13:15) con aviso de vida
15 3,13 * * * php /RUTA/contratos/scripts/respaldo.php --conservar=14 >> /RUTA/contratos/respaldos/respaldo.log 2>&1 && curl -fsS -m 10 https://hc-ping.com/<ID-DEL-AVISO> > /dev/null
# Copia cifrada fuera del servidor (03:45), con rclone configurado con un destino «crypt» llamado externo-cifrado
45 3 * * * rclone copy /RUTA/contratos/respaldos externo-cifrado:contratos/diarios --include "respaldo-*.tar.gz" --max-age 24h >> /RUTA/contratos/respaldos/externo.log 2>&1
```
La rotación externa (30 diarios + 12 mensuales) se configura con reglas de ciclo de vida del almacenamiento,
o copiando el primer respaldo de cada mes a una carpeta `mensuales/`.

## Qué se respalda
`scripts/respaldo.php` crea `respaldos/respaldo-AAAAMMDD-HHMMSS.tar.gz` (permisos 0600) con:
- `storage/contratos.sqlite`: instantánea consistente de la base (`VACUUM INTO`), aunque la app esté escribiendo.
- `storage/documentos/`: todos los PDF enviados y firmados.
- `storage/clave-enlaces.key`: clave de los enlaces de firma guardados (si existe).
- `.env`: configuración y secretos.
- `manifest.json`: fecha, filas por tabla y sha256 de cada archivo.

El archivo contiene secretos y datos personales: no se publica, no se envía por correo y se guarda cifrado fuera del servidor.

## Programarlo (una vez)
En CyberPanel: **Websites → (el sitio) → Cron Jobs**, o por SSH con `crontab -e` del usuario del sitio:
Usar las líneas de «Cron recomendado». Con solo la primera línea (sin aviso ni copia externa) ya hay respaldo
local, pero no cumple la estrategia.
- `respaldos/` está fuera de la carpeta pública y en `.gitignore`.
- Revisar `respaldos/respaldo.log` la primera semana.

## Simulacro de restauración (mensual, y en la fase 0 una vez obligatoria)
```
php scripts/restaurar.php respaldos/respaldo-AAAAMMDD-HHMMSS.tar.gz
```
No toca producción. Comprueba sha256 de cada archivo, integridad de la base, filas por tabla y que cada PDF
registrado está en el respaldo. Guardar la salida con fecha en el registro de operación.
**Criterio de salida de la fase 0:** un simulacro con `RESULTADO: OK` sobre un respaldo real del servidor.

## Restauración real (manual, con cuidado)
1. Avisar al personal: nadie envía ni firma durante la restauración.
2. Hacer un respaldo del estado actual, aunque esté dañado: `php scripts/respaldo.php --destino=/RUTA/respaldos-emergencia`.
3. Verificar el respaldo elegido con `scripts/restaurar.php` (debe dar OK).
4. Apartar lo actual: `mv storage storage.antes-AAAAMMDD` y copiar `.env` a `.env.antes-AAAAMMDD`.
5. Descomprimir el respaldo en una carpeta temporal y copiar `storage/` y `.env` a su lugar.
6. Ajustar dueño y permisos al usuario del sitio (el mismo que tenía `storage.antes-…`).
7. Si la ruta del proyecto cambió, actualizar las rutas de los PDF:
   ```
   sqlite3 storage/contratos.sqlite "UPDATE documentos SET ruta = REPLACE(ruta, '/ruta/vieja', '/ruta/nueva'); UPDATE documentos_firmados SET ruta = REPLACE(ruta, '/ruta/vieja', '/ruta/nueva');"
   ```
8. Entrar al panel, abrir un convenio enviado y uno firmado, y ver sus PDF.
9. Conservar `storage.antes-…` al menos una semana antes de borrarlo.
