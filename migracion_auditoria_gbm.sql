-- =============================================================
-- Migración: marca de auditoría en los registros
-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run
-- =============================================================
-- Agrega a `registros` dos campos para recordar qué movimientos ya se
-- compararon contra los documentos que emite GBM:
--
--   auditado_en:  cuándo se marcó como auditado. NULL = sin auditar.
--                 De ahí sale el progreso: cuántos movimientos de cada mes
--                 ya cuadraron contra el documento del broker.
--
--   auditado_doc: contra qué documento cuadró, para poder rastrearlo después.
--                 Guarda el nombre del archivo y su periodo.
--
-- Un movimiento sólo se marca cuando coincidió exactamente con lo que dice
-- GBM. Los que tienen diferencias se quedan sin marcar a propósito: son
-- justamente los que faltan por resolver.
--
-- La marca se borra sola al editar el movimiento. Un dato que cambió después
-- de auditarse ya no está auditado, y dejar la marca puesta convertiría el
-- progreso en un número que miente.
--
-- Es seguro ejecutarlo dos veces: no toca ningún dato existente y las
-- columnas se crean sólo si no están.

ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS auditado_en timestamptz,
    ADD COLUMN IF NOT EXISTS auditado_doc text;


-- =============================================================
-- VERIFICACIÓN  (ejecútala después y deberías ver las dos columnas)
-- =============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'registros'
  AND column_name IN ('auditado_en', 'auditado_doc')
ORDER BY column_name;


-- =============================================================
-- PROGRESO POR MES  (opcional: lo mismo que enseña la app)
-- =============================================================
-- SELECT
--     to_char(r.fecha, 'YYYY-MM')                       AS mes,
--     COUNT(*)                                          AS movimientos,
--     COUNT(r.auditado_en)                              AS auditados,
--     COUNT(*) - COUNT(r.auditado_en)                   AS pendientes
-- FROM registros r
-- JOIN categorias c ON c.id = r.categoria_id
-- WHERE c.tipo = 'inversion'
--   AND r.tipo_movimiento IS NOT NULL
-- GROUP BY 1
-- ORDER BY 1 DESC;


-- =============================================================
-- DESHACER  (quita las columnas y con ellas todo el progreso)
-- =============================================================
-- ALTER TABLE registros
--     DROP COLUMN IF EXISTS auditado_en,
--     DROP COLUMN IF EXISTS auditado_doc;
