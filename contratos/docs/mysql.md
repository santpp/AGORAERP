# MySQL / MariaDB en producción

Desde la fase 1 la aplicación funciona con SQLite (pruebas, desarrollo) o con MySQL/MariaDB (producción).
Probado con MariaDB 10.11 (la del servidor). El esquema se crea solo con las migraciones de
`src/Persistencia/migraciones/mysql/`.

## 1. Crear la base y el usuario de la aplicación
En CyberPanel: **Databases → Create Database**, sobre el sitio de contratos:
- Base: `contratos` · Usuario: `contratos_app` · Clave: larga y aleatoria.
- CyberPanel puede anteponer un prefijo a los nombres: usar los nombres finales que muestra.

Comprobar el juego de caracteres (por SSH, como root):
```
mysql -e "ALTER DATABASE <base> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## 2. `.env`
```
CONTRATOS_BD=mysql:host=localhost;dbname=<base>;charset=utf8mb4
CONTRATOS_BD_USUARIO=<usuario>
CONTRATOS_BD_CLAVE=<clave>
```
`host=localhost` usa el socket local, que es como CyberPanel crea los usuarios (`usuario@localhost`).
Las tablas se crean solas en la primera petición (migraciones). También se pueden crear a mano con
`php scripts/migrar.php`.

## 3. Pasar los datos de SQLite a MySQL (una sola vez)
Primero en `tests.agoradigital.app`, después en producción, en un momento sin actividad:
1. Respaldo de lo actual: `php scripts/respaldo.php` (todavía con SQLite).
2. Crear la base (paso 1) y anotar la línea actual de `CONTRATOS_BD` (la de SQLite) para poder volver.
3. Cambiar `.env` a MySQL (paso 2).
4. Traspasar y verificar:
   ```
   php scripts/sqlite-a-mysql.php /ruta/storage/contratos.sqlite
   ```
   Abre el SQLite en solo lectura, exige una base MySQL vacía, copia todo en una transacción con los mismos
   id y compara filas y suma sha256 de cada tabla. Solo sirve si termina con «Traspaso completo y verificado».
5. Entrar al panel: lista, un convenio enviado (PDF), uno firmado (PDF firmado), crear y previsualizar un borrador.
6. Todos vuelven a iniciar sesión (las sesiones no se copian).
7. Guardar el archivo SQLite al menos 30 días.

**Volver atrás:** restaurar la línea de SQLite en `.env`. Lo que se haya hecho en MySQL después del cambio no
estará en SQLite; por eso el cambio se hace sin actividad y se prueba antes en el entorno de pruebas.

## 4. Usuario de solo lectura (consultas e informes)
Por SSH, como root:
```
mysql -e "CREATE USER 'contratos_lectura'@'localhost' IDENTIFIED BY '<clave>';
          CREATE USER 'contratos_lectura'@'127.0.0.1' IDENTIFIED BY '<clave>';
          GRANT SELECT ON <base>.* TO 'contratos_lectura'@'localhost';
          GRANT SELECT ON <base>.* TO 'contratos_lectura'@'127.0.0.1';"
```
Es el usuario para conectarse desde fuera: puede leer, nunca modificar.

## 5. Acceso remoto seguro (túnel SSH)
El puerto 3306 **no** se abre a Internet. Se entra por SSH, que ya está protegido:
- **Con un cliente gráfico** (DBeaver, TablePlus, HeidiSQL, MySQL Workbench): en la conexión, pestaña SSH,
  poner IP del servidor, usuario y clave o llave SSH; en la parte de base: host `127.0.0.1`, puerto `3306`,
  usuario `contratos_lectura`.
- **Desde la terminal:**
  ```
  ssh -N -L 3307:127.0.0.1:3306 usuario@IP-DEL-SERVIDOR
  ```
  y conectar el cliente a `127.0.0.1:3307`.
- Alternativa sin cliente: **phpMyAdmin** de CyberPanel (Databases → phpMyAdmin), detrás del acceso al panel.

Comprobar que 3306 sigue cerrado al público: en CyberPanel, **Security → Firewall**, no debe haber regla que lo abra.

## 6. Respaldos con MySQL
`scripts/respaldo.php` detecta MySQL y usa `mysqldump --single-transaction` (sin bloquear la aplicación).
El simulacro completo importa el volcado en una base de simulacro vacía y dedicada:
```
CONTRATOS_SIMULACRO_USUARIO=<u> CONTRATOS_SIMULACRO_CLAVE=<c> \
php scripts/restaurar.php respaldos/respaldo-….tar.gz --importar-en='mysql:host=localhost;dbname=<base_simulacro>;charset=utf8mb4'
```
La base de simulacro queda vacía al terminar.

## 7. Pruebas automáticas contra MySQL
```
CONTRATOS_PRUEBAS_BD='mysql:host=localhost;dbname=<base_de_pruebas>;charset=utf8mb4' \
CONTRATOS_PRUEBAS_BD_USUARIO=<u> CONTRATOS_PRUEBAS_BD_CLAVE=<c> php tests/run.php
```
Usar solo una base de pruebas: se vacía antes de cada prueba.
