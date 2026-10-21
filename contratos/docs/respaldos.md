# Copias de seguridad y restauración

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
```
15 3 * * * php /RUTA/contratos/scripts/respaldo.php --conservar=14 >> /RUTA/contratos/respaldos/respaldo.log 2>&1
```
- Se ejecuta a las 3:15 cada día y conserva 14 días.
- `respaldos/` está fuera de la carpeta pública y en `.gitignore`.
- Revisar `respaldos/respaldo.log` la primera semana.

## Copia fuera del servidor
Un respaldo que vive en el mismo servidor no protege de la pérdida del servidor. Mínimo semanal:
- descargar el último `.tar.gz` a un almacenamiento cifrado (Google Drive de la empresa, disco cifrado), o
- automatizarlo con `rclone` hacia un bucket o carpeta de Drive con cifrado.

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
