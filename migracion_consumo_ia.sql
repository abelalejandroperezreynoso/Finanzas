-- ============================================================================
-- CONSUMO DE LA IA: tokens y costo de cada consulta, y el resumen para Configuración
-- ============================================================================
--
-- La función topes-ia anota en uso_ia cuántos tokens gastó cada consulta y lo que
-- costó según el precio del modelo. La tarjeta de Configuración lee el resumen con
-- resumen_uso_ia(): un administrador ve el total de toda la app; cualquier otro
-- usuario, sólo lo suyo.
--
-- Requiere haber corrido migracion_uso_ia.sql antes. Es idempotente.
-- ============================================================================

ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS modelo         text;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_entrada integer;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_salida  integer;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS costo_usd      numeric;

-- Quién administra la app: ve el consumo de todos
CREATE TABLE IF NOT EXISTS admins_app (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);
ALTER TABLE admins_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_app ver lo propio" ON admins_app;
CREATE POLICY "admins_app ver lo propio" ON admins_app
    FOR SELECT USING (auth.uid() = user_id);

-- El resumen corre con permisos de la base para poder sumar a todos, pero sólo lo
-- hace si quien pregunta es administrador; si no, suma únicamente lo suyo
CREATE OR REPLACE FUNCTION resumen_uso_ia()
RETURNS TABLE (alcance text, consultas_mes bigint, costo_mes numeric, consultas_total bigint, costo_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH es_admin AS (
        SELECT EXISTS (SELECT 1 FROM admins_app WHERE user_id = auth.uid()) AS si
    )
    SELECT
        CASE WHEN (SELECT si FROM es_admin) THEN 'app' ELSE 'propio' END,
        count(*) FILTER (WHERE creado_en >= date_trunc('month', now())),
        coalesce(sum(costo_usd) FILTER (WHERE creado_en >= date_trunc('month', now())), 0),
        count(*),
        coalesce(sum(costo_usd), 0)
    FROM uso_ia
    WHERE (SELECT si FROM es_admin) OR user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION resumen_uso_ia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resumen_uso_ia() TO authenticated;

-- Hazte administrador: cambia el correo por el tuyo y corre esta línea
-- INSERT INTO admins_app (user_id) SELECT id FROM auth.users WHERE email = 'tu-correo@ejemplo.com' ON CONFLICT DO NOTHING;
