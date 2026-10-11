-- =============================================================================
-- 02 · MANTENIMIENTO, RETENCIÓN Y CONSULTAS ÚTILES (como administrador)
-- La web no tiene permiso UPDATE ni DELETE: esto lo corres tú desde
-- phpMyAdmin o un cron mensual.
-- =============================================================================

-- Anonimiza la huella de IP de prospectos con más de 180 días
UPDATE diagnosticos SET ip_hash = NULL
 WHERE ip_hash IS NOT NULL AND creado_en < NOW() - INTERVAL 180 DAY;

-- Agenda de mañana
-- SELECT inicio, nombre, empresa, telefono, objetivo, equipo, plan FROM diagnosticos
--  WHERE estado IN ('nuevo','confirmado') AND DATE(inicio) = CURDATE() + INTERVAL 1 DAY ORDER BY inicio;

-- Marcar una reserva como confirmada / cancelada (libera el horario)
-- UPDATE diagnosticos SET estado = 'confirmado' WHERE id = ?;
-- UPDATE diagnosticos SET estado = 'cancelado'  WHERE id = ?;

-- Interés por plan (últimos 30 días)
-- SELECT COALESCE(plan, '(sin elegir)') AS plan, COUNT(*) AS prospectos FROM diagnosticos
--  WHERE creado_en >= NOW() - INTERVAL 30 DAY GROUP BY plan ORDER BY prospectos DESC;

-- Prospectos por campaña (últimos 30 días)
-- SELECT utm_source, utm_campaign, COUNT(*) AS prospectos FROM diagnosticos
--  WHERE creado_en >= NOW() - INTERVAL 30 DAY GROUP BY utm_source, utm_campaign ORDER BY prospectos DESC;

-- Tasa de asistencia
-- SELECT estado, COUNT(*) FROM diagnosticos WHERE inicio < NOW() GROUP BY estado;
