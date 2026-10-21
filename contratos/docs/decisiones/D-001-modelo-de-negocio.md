# D-001 · Modelo de negocio de la plataforma

**Estado:** pendiente. Debe cerrarse antes de terminar la fase 0.
**Fecha de apertura:** 21/10/2026.

## Contexto
La plataforma hoy sirve a una sola empresa (ASOCIM). La fase 3 la convierte en multi-empresa. La forma
del modelo de datos, la consola de alta y la facturación dependen de quién es el dueño de cada cuenta.

## Opciones
**A. Agencia tipo GHL.** Agora es la agencia: da de alta a cada empresa, conecta su subcuenta de GHL, carga
su formato de contrato y le factura. Las empresas no se registran solas.
- A favor: encaja con D-002 (cada contrato se calibra a mano por Agora); control total del alta; soporte centralizado.
- En contra: cada alta requiere trabajo de Agora; crecimiento limitado por esa capacidad.

**B. Empresas independientes (autoservicio).** Cada empresa se registra, conecta su GHL y gestiona su cuenta.
- A favor: escala sin intervención.
- En contra: choca con D-002 (la calibración manual exige a Agora en cada alta); más superficie de seguridad
  (registro público, verificación de identidad, cobro automático).

**C. Mixto.** Alta por Agora (A) y administración posterior por la empresa (usuarios, textos de correo, marca).

## Recomendación
**C**, con el alta siempre por Agora. Es la única coherente con D-002 y permite delegar lo que no requiere código.

## Decisión
_Pendiente de confirmar por la dirección de Agora._

## Consecuencias (si se elige C)
- No hay registro público. La consola de agencia (fase 5) es interna.
- Cada empresa tiene al menos un ADMIN propio que gestiona usuarios y textos, pero no su formato de PDF.
- La facturación de la plataforma es manual o semiautomática al principio.
