# D-002 · Generación del PDF: calibración manual en código por contrato y por empresa

**Estado:** decidida. **Fecha:** 21/10/2026. **Decide:** dirección de Agora.

## Contexto
Cada empresa trae su propio contrato en PDF. Había dos caminos: calibrar cada PDF original (escribir los
datos encima, en sus posiciones) o rehacer cada contrato como plantilla HTML y generar el PDF desde ahí.

## Decisión
Cada contrato de cada empresa se calibra **a mano, en código**: un módulo de Python por contrato en
`tools/pdf/formatos/<empresa>_<contrato>.py`, sobre el PDF original de la empresa.

## Consecuencias
- El PDF final conserva el diseño original de la empresa (logos, tipografías, pie, tablas).
- Cada alta de un contrato nuevo requiere trabajo de desarrollo (calibración y aprobación de casos).
- Se preparó en la fase 0:
  - `tools/pdf/motor.py`: funciones comunes (buscar, borrar, escribir, ajustar tamaño, justificar, firmas).
  - `tools/pdf/formatos/asocim_convenio.py`: el convenio de ASOCIM, separado del motor.
  - `tools/pdf/formatos/_plantilla.py`: punto de partida para un formato nuevo.
  - `tools/pdf/inspeccionar.py`: coordenadas de cada texto y rejilla de calibración.
  - `tools/pdf/regresion.py` y `tools/pdf/casos/`: pruebas de regresión con huellas aprobadas.
  - `tools/pdf/CALIBRACION.md`: guía paso a paso.
- El PDF original de cada empresa no se sube a Git (material del cliente); las pruebas de regresión necesitan
  tenerlo en `plantillas/`.
- Un cambio en el PDF original de una empresa se trata como una versión nueva del formato; los convenios
  ya enviados conservan su PDF.
- Revisión de esta decisión: si el volumen de altas supera la capacidad de calibración, reconsiderar
  plantillas HTML para contratos nuevos (sin tocar los ya calibrados).
