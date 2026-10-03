-- ============================================================================
-- CONSUMO DE LA IA: tokens y costo de cada consulta, y el resumen para Configuración
-- ============================================================================
--
-- La función topes-ia anota en uso_ia cuántos tokens gastó cada consulta y lo que
-- costó según el precio del modelo. La tarjeta de Configuración lee el resumen con
-- resumen_uso_ia(): el total de toda la app, igual para todos los usuarios. Sólo
-- devuelve sumas; nadie ve las consultas de otro usuario.
--
-- Requiere haber corrido migracion_uso_ia.sql antes. Es idempotente.
-- ============================================================================

ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS modelo         text;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_entrada integer;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_salida  integer;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS costo_usd      numeric;

-- Corre con permisos de la base para poder sumar a todos los usuarios
DROP FUNCTION IF EXISTS resumen_uso_ia();
CREATE FUNCTION resumen_uso_ia()
RETURNS TABLE (consultas_mes bigint, costo_mes numeric, consultas_total bigint, costo_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        count(*) FILTER (WHERE creado_en >= date_trunc('month', now())),
        coalesce(sum(costo_usd) FILTER (WHERE creado_en >= date_trunc('month', now())), 0),
        count(*),
        coalesce(sum(costo_usd), 0)
    FROM uso_ia;
$$;

REVOKE ALL ON FUNCTION resumen_uso_ia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resumen_uso_ia() TO authenticated;
