-- ============================================================================
-- SALDO DE LA IA: cuánto queda del crédito de Anthropic
-- ============================================================================
--
-- Anthropic no deja leer el saldo desde una app, así que se anota a mano: en
-- Configuración se escribe el saldo que muestra console.anthropic.com y se guarda
-- aquí con su fecha. El saldo restante es el último que se anotó menos lo que se
-- ha gastado desde ese momento (la suma de costo_usd de uso_ia).
--
-- Requiere migracion_uso_ia.sql y migracion_consumo_ia.sql. Es idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS saldo_ia (
    id        bigserial PRIMARY KEY,
    user_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    saldo_usd numeric NOT NULL CHECK (saldo_usd >= 0),
    creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saldo_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saldo_ia anotar lo propio" ON saldo_ia;
CREATE POLICY "saldo_ia anotar lo propio" ON saldo_ia
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP FUNCTION IF EXISTS resumen_uso_ia();
CREATE FUNCTION resumen_uso_ia()
RETURNS TABLE (
    consultas_mes bigint, costo_mes numeric, consultas_total bigint, costo_total numeric,
    saldo_anotado numeric, saldo_anotado_en timestamptz, gastado_desde_saldo numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ultimo AS (
        SELECT saldo_usd, creado_en FROM saldo_ia ORDER BY creado_en DESC LIMIT 1
    )
    SELECT
        count(*) FILTER (WHERE u.creado_en >= date_trunc('month', now())),
        coalesce(sum(u.costo_usd) FILTER (WHERE u.creado_en >= date_trunc('month', now())), 0),
        count(*),
        coalesce(sum(u.costo_usd), 0),
        (SELECT saldo_usd FROM ultimo),
        (SELECT creado_en FROM ultimo),
        coalesce(sum(u.costo_usd) FILTER (WHERE u.creado_en > (SELECT creado_en FROM ultimo)), 0)
    FROM uso_ia u;
$$;

REVOKE ALL ON FUNCTION resumen_uso_ia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resumen_uso_ia() TO authenticated;
