-- resumen_uso_ia() también dice cuánto gastó quien pregunta (gastado_mio_desde_saldo,
-- costo_mes_mio), para pintar la raya de crédito del chat con un color por persona. Lo de
-- la otra persona es el total menos lo propio: no se exponen ids ni correos.
-- Sólo reemplaza la función (agrega columnas al final); no cambia datos. Se puede correr
-- varias veces.
DROP FUNCTION IF EXISTS resumen_uso_ia();
CREATE FUNCTION resumen_uso_ia()
RETURNS TABLE (
    consultas_mes bigint, costo_mes numeric, consultas_total bigint, costo_total numeric,
    saldo_anotado numeric, saldo_anotado_en timestamptz, gastado_desde_saldo numeric,
    gastado_mio_desde_saldo numeric, costo_mes_mio numeric
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
        coalesce(sum(u.costo_usd) FILTER (WHERE u.creado_en > (SELECT creado_en FROM ultimo)), 0),
        coalesce(sum(u.costo_usd) FILTER (WHERE u.creado_en > (SELECT creado_en FROM ultimo) AND u.user_id = auth.uid()), 0),
        coalesce(sum(u.costo_usd) FILTER (WHERE u.creado_en >= date_trunc('month', now()) AND u.user_id = auth.uid()), 0)
    FROM uso_ia u;
$$;

REVOKE ALL ON FUNCTION resumen_uso_ia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resumen_uso_ia() TO authenticated;
