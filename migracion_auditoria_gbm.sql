-- =============================================================
-- Migración: dejar la base lista para la auditoría GBM
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
-- =============================================================
-- Agrega a `registros` las dos columnas donde vive el progreso de auditoría:
--
--   auditado_en:  cuándo se marcó como auditado. NULL = sin auditar.
--                 De ahí sale el progreso que enseña la app: cuántos
--                 movimientos de cada mes ya cuadraron contra el documento
--                 que emite el broker.
--
--   auditado_doc: contra qué documento cuadró, para poder rastrearlo después.
--                 Guarda la identidad del documento y no el nombre del
--                 archivo: dentro de un año "Trading USA · junio 2026" dice
--                 algo y "Documento_PDF (2).pdf" no dice nada.
--
-- Un movimiento sólo se marca cuando coincidió exactamente con lo que dice
-- GBM. Los que tienen diferencias se quedan sin marcar a propósito: son
-- justamente los que faltan por resolver.
--
-- La marca se borra sola al editar el movimiento. Un dato que cambió después
-- de auditarse ya no está auditado, y dejar la marca puesta convertiría el
-- progreso en un número que miente.
--
-- De paso comprueba las columnas del flujo GBM (tipo_movimiento y monto_usd).
-- Si ya ejecutaste migracion_flujo_gbm.sql ya están y no pasa nada: todo el
-- script usa IF NOT EXISTS, no toca ningún dato y se puede ejecutar las veces
-- que quieras.


-- -------------------------------------------------------------
-- PASO 1 · Columnas del flujo GBM (red de seguridad)
-- -------------------------------------------------------------
ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS tipo_movimiento text
        CHECK (tipo_movimiento IN ('aportacion', 'compra', 'venta', 'retiro')),
    ADD COLUMN IF NOT EXISTS monto_usd numeric NOT NULL DEFAULT 0;


-- -------------------------------------------------------------
-- PASO 2 · Columnas de la auditoría
-- -------------------------------------------------------------
ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS auditado_en timestamptz,
    ADD COLUMN IF NOT EXISTS auditado_doc text;


-- -------------------------------------------------------------
-- PASO 3 · Verificación
-- -------------------------------------------------------------
-- Deberías ver cuatro renglones, todos con estado "listo".
SELECT
    esperada.column_name                                   AS columna,
    COALESCE(real.data_type, '—')                          AS tipo,
    CASE WHEN real.column_name IS NULL
         THEN 'FALTA'
         ELSE 'listo' END                                  AS estado
FROM (VALUES
        ('tipo_movimiento'),
        ('monto_usd'),
        ('auditado_en'),
        ('auditado_doc')
     ) AS esperada(column_name)
LEFT JOIN information_schema.columns AS real
       ON real.table_name  = 'registros'
      AND real.table_schema = 'public'
      AND real.column_name = esperada.column_name
ORDER BY 1;


-- -------------------------------------------------------------
-- PASO 4 · Punto de partida  (opcional, sólo para verlo)
-- -------------------------------------------------------------
-- Los movimientos de inversión que tienes por mes. Es lo mismo que la app
-- enseña al abrir la auditoría, y al ejecutarlo recién migrado deberían salir
-- todos con 0 auditados: aún no has marcado nada.
SELECT
    to_char(r.fecha, 'YYYY-MM')                      AS mes,
    COUNT(*)                                         AS movimientos,
    COUNT(r.auditado_en)                             AS auditados,
    COUNT(*) - COUNT(r.auditado_en)                  AS pendientes
FROM registros r
JOIN categorias c ON c.id = r.categoria_id
WHERE c.tipo = 'inversion'
  AND r.tipo_movimiento IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;


-- =============================================================
-- DESHACER  (quita las columnas de auditoría y con ellas el progreso.
--            No toca tipo_movimiento ni monto_usd, que sí guardan datos)
-- =============================================================
-- ALTER TABLE registros
--     DROP COLUMN IF EXISTS auditado_en,
--     DROP COLUMN IF EXISTS auditado_doc;
