# Calibración de un contrato nuevo

Cada contrato de cada empresa se calibra **a mano, en código** (decisión D-002). Un formato es un
módulo de Python en `formatos/` que abre el PDF original de la empresa, borra los datos de ejemplo
y escribe los del contrato en las mismas posiciones. El motor común (`motor.py`) hace el trabajo
repetitivo; el formato solo contiene coordenadas y textos de búsqueda.

## Qué pedir a la empresa
- El contrato original en **PDF** (no escaneado: tiene que tener texto seleccionable), sin firmar.
- Un ejemplo **llenado a mano** con datos ficticios, para ver dónde va cada dato.
- La lista de campos variables (nombre, cédula, montos, fechas, modalidad, cronograma…).
- Dónde firma el cliente (todas las cajas o líneas de firma).
- Reglas especiales: páginas que se reordenan, tablas con número máximo de filas, textos que cambian según la modalidad.

## Pasos
1. **Guardar el original** en `plantillas/<empresa>/<contrato>.pdf`. No va a Git (es material del cliente).
2. **Inspeccionar**:
   ```
   python3 tools/pdf/inspeccionar.py plantillas/<empresa>/<contrato>.pdf                 # textos y coordenadas
   python3 tools/pdf/inspeccionar.py plantillas/<empresa>/<contrato>.pdf --buscar "CÉDULA"
   python3 tools/pdf/inspeccionar.py plantillas/<empresa>/<contrato>.pdf --rejilla /tmp/rejilla
   ```
   La rejilla marca cada 10 pt (rojo = x, azul = y, con número cada 50 pt).
3. **Crear el formato**: copiar `formatos/_plantilla.py` a `formatos/<empresa>_<contrato>.py`.
   El nombre solo admite minúsculas, números y guion bajo.
4. **Calibrar campo por campo**:
   - Localiza el texto de ejemplo con `buscar(pagina, texto, zona=...)`. La zona evita confundirlo con otra aparición.
   - Márcalo con `cubrir()` y borra con `aplicar_borrado()` **una vez por página**, después de marcar todo.
   - Escribe el dato con `escribir()` en `origen_y()` (la línea base real del original).
   - Si el dato puede ser más largo que el hueco, usa `ajustar_tamano()` con un mínimo legible.
   - Si un dato no tiene texto de ejemplo, usa coordenadas fijas medidas en la rejilla.
   - Fuentes: `fuentes_inter()` para texto nuevo; si el original usa otra fuente embebida, se puede extraer del PDF (ver `asocim_convenio.py`, Open Sans).
5. **Firmas**: medir cada caja y listarlas en `CAJAS_CLIENTE` como `(página desde 0, (x0, y0, x1, y1))`.
6. **Probar a mano**:
   ```
   python3 tools/pdf/llenar_convenio.py datos.json /tmp/prueba.pdf tools/pdf/firma_ejemplo.png
   ```
   con `"formato": "<empresa>_<contrato>"` en `datos.json`. Revisar todas las páginas a 100 % y en el móvil.
7. **Casos de regresión**: crear `casos/<empresa>_<contrato>/<caso>/datos.json` (mínimo: ejemplo normal,
   nombre largo, sin firma, máximo de cuotas). Un archivo vacío `firma` en el caso indica que se firma.
   Revisar el PDF y, cuando esté aprobado:
   ```
   python3 tools/pdf/regresion.py <empresa>_<contrato> --aprobar
   ```
8. **Antes de cada despliegue**: `python3 tools/pdf/regresion.py` (todos los formatos). Cualquier cambio de
   posición aparece como «falta … / sobra …» con la palabra y sus coordenadas.

## Reglas
- Nunca cambiar coordenadas de un formato aprobado sin volver a aprobar sus casos y revisar el PDF.
- Si la empresa cambia su PDF original, es un formato nuevo o una nueva versión (`<empresa>_<contrato>_v2`):
  los convenios ya enviados conservan su PDF; solo los nuevos usan la versión nueva.
- El formato no decide reglas de negocio (montos, fechas): solo dibuja lo que recibe en `datos`.
- Los datos que recibe un formato los arma PHP (`ContratoServicio::datosPdf`). Un campo nuevo se añade allí.

## Referencia: el formato de ASOCIM
`formatos/asocim_convenio.py` es el ejemplo completo: búsqueda con zonas, tamaño ajustado del nombre,
cláusula movida de página, anexo y tabla combinados en una página, marca de agua recortada y tres cajas de firma.
