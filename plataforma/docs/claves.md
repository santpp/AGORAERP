# Claves de cifrado

Hoy se cifra un solo dato: el enlace de firma que el panel muestra otra vez mientras siga vigente
(`enlaces_firma.token_cifrado`). El código está en `src/Seguridad/Llavero.php`.

## Cómo funciona
- `storage/claves/v1.key`, `v2.key`, …: cada archivo es una clave maestra aleatoria de 32 bytes (base64, permisos 0600).
  La aplicación crea `v1.key` sola la primera vez que la necesita. Está fuera de `public/` y fuera de git.
- La versión más alta cifra; todas las que estén en la carpeta descifran.
- Cada uso tiene su propia subclave: `HKDF-SHA256(maestra, info = "agora-plataforma/<uso>")`. Hoy el único uso es
  `enlaces-firma`. Cuando haya empresas (fase 2) el `info` podrá llevar la empresa y cada una tendrá su subclave.
- Valor guardado: `v<n>:` + base64(iv 12 bytes | tag 16 | cifrado), AES-256-GCM. `v<n>:<uso>` va como dato autenticado:
  un valor alterado, o presentado como de otra versión o de otro uso, no se descifra.
- Formato anterior (sin `v<n>:`, el de `contratos/`): se sigue leyendo con `APP_CLAVE` (si está en `.env`) o con
  `storage/clave-enlaces.key`. Solo para leer: lo nuevo siempre se cifra con `storage/claves`.

## Rotar (por ejemplo, una vez al año o si una clave pudo filtrarse)
```bash
php scripts/rotar-claves.php
```
Crea la versión siguiente, recifra con ella todos los enlaces guardados (en una transacción) y dice qué claves
antiguas ya no usa ningún dato. Una petición que estaba en curso durante la rotación puede haber cifrado con la clave
anterior: si el informe dice «aún la usan», ejecuta `php scripts/rotar-claves.php --recifrar` y vuelve a mirar.

Retirar una clave que ya no se usa: sácala de `storage/claves/` y guárdala aparte, cifrada, mientras existan
respaldos que la necesiten. Sin ella, esos respaldos no pueden mostrar los enlaces (el resto del respaldo sí sirve).

## Traer datos desde contratos/
Después de copiar la base con `scripts/sqlite-a-mysql.php`, copia también `storage/clave-enlaces.key` de contratos (o
pon su `APP_CLAVE` en `.env`) y ejecuta `php scripts/rotar-claves.php --recifrar`. Cuando el informe diga que el
formato anterior ya no se usa, borra `clave-enlaces.key` y quita `APP_CLAVE`.

## Si se pierde una clave
Los enlaces cifrados con ella dejan de mostrarse en el panel; el enlace sigue funcionando para el cliente que ya lo
recibió. Se arregla generando un enlace nuevo desde el detalle del contrato. Por eso las claves van en cada respaldo.
