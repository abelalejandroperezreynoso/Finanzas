-- =============================================================================
-- Migración OPCIONAL: separar las compras históricas en Aportación + Compra
-- =============================================================================
-- Tus compras antiguas se guardaron como un solo paso (pesos → acciones), pero
-- en la realidad el dinero primero entró a la Caja GBM y después compró acciones.
-- Este script las divide en dos registros para que el historial refleje el flujo
-- real, SIN alterar ningún saldo, costo base ni rendimiento.
--
-- POR QUÉ NO CAMBIAN LOS NÚMEROS
-- La aportación se crea con los mismos pesos del registro original y con los
-- dólares exactos de la compra (acciones × precio). El tipo de cambio implícito
-- queda entonces:
--        TC = pesos pagados ÷ dólares de la compra
-- Al procesar la compra, ésta hereda ese TC de la caja y recalcula:
--        dólares × TC = pesos pagados      ← el costo base original, exacto
-- y la caja vuelve a cero, lista para el siguiente par.
--
-- CÓMO USARLO
--   PASO 0  Ejecuta el bloque de VERIFICACIÓN PREVIA y guarda el resultado.
--   PASO 1  Ejecuta la MIGRACIÓN completa (es una transacción: todo o nada).
--   PASO 2  Ejecuta la VERIFICACIÓN POSTERIOR y compara con el paso 0.
--   Si algo no cuadra, ejecuta el ROLLBACK del final.
--
-- Es idempotente: solo toca registros con tipo_movimiento IS NULL, así que
-- ejecutarlo dos veces no duplica nada. Tus registros nuevos no se tocan.
--
-- CÓMO IDENTIFICAR LO MIGRADO
-- Todo registro creado o modificado por este script queda marcado con el
-- sufijo "[migrado]" en su descripción, así que lo reconoces en el historial
-- de la app y puedes buscarlo escribiendo  migrado  en el buscador.
-- El PASO 3 lista todo lo marcado.
-- =============================================================================


-- =============================================================================
-- PASO 0 · VERIFICACIÓN PREVIA  (ejecuta solo esto primero y guarda el result)
-- =============================================================================
SELECT
    c.nombre                              AS empresa,
    COUNT(*)                              AS compras_a_migrar,
    ROUND(SUM(ABS(r.monto))::numeric, 2)  AS pesos_invertidos,
    ROUND(SUM(r.cantidad_acciones)::numeric, 4) AS acciones_totales
FROM registros r
JOIN categorias c ON c.id = r.categoria_id
WHERE r.tipo_movimiento IS NULL
  AND c.tipo = 'inversion'
  AND c.ticker IS NOT NULL
  AND r.monto < 0
  AND r.cantidad_acciones > 0
  AND r.costo_accion > 0
GROUP BY c.nombre
ORDER BY c.nombre;

-- 0.2 CONTROL · Registros de inversión que NO se migrarán y por qué.
--     Lo esperado es que salga vacío. Si aparece algo, esos registros se
--     quedan con la mecánica antigua (la app los sigue soportando), pero
--     conviene revisarlos antes de continuar.
SELECT
    c.nombre                       AS empresa,
    r.fecha,
    ROUND(r.monto::numeric, 2)     AS monto,
    r.cantidad_acciones,
    r.costo_accion,
    CASE
        WHEN r.monto >= 0                 THEN 'Es una entrada (venta o ajuste), no una compra'
        WHEN COALESCE(r.cantidad_acciones, 0) <= 0 THEN 'Sin cantidad de acciones'
        WHEN COALESCE(r.costo_accion, 0)      <= 0 THEN 'Sin precio por acción'
    END                            AS motivo
FROM registros r
JOIN categorias c ON c.id = r.categoria_id
WHERE r.tipo_movimiento IS NULL
  AND c.tipo = 'inversion'
  AND c.ticker IS NOT NULL
  AND NOT (r.monto < 0 AND r.cantidad_acciones > 0 AND r.costo_accion > 0)
ORDER BY c.nombre, r.fecha;


-- =============================================================================
-- PASO 1 · MIGRACIÓN  (ejecuta todo este bloque de una vez)
-- =============================================================================
BEGIN;

-- 1.1 Respaldo completo antes de tocar nada -----------------------------------
DROP TABLE IF EXISTS registros_backup_pre_caja_gbm;
CREATE TABLE registros_backup_pre_caja_gbm AS SELECT * FROM registros;

-- 1.2 Crear la categoría "Caja GBM" en cada cuenta que tenga inversiones ------
--     (sin predicciones: la caja no es un gasto recurrente)
INSERT INTO categorias (cuenta_id, nombre, tipo, ticker, desactivar_prediccion, user_id)
SELECT DISTINCT c.cuenta_id, 'Caja GBM', 'inversion', NULL, true, c.user_id
FROM categorias c
WHERE c.tipo = 'inversion'
  AND c.ticker IS NOT NULL
  AND NOT EXISTS (
        SELECT 1 FROM categorias c2
        WHERE c2.cuenta_id = c.cuenta_id
          AND c2.user_id   = c.user_id
          AND c2.tipo      = 'inversion'
          AND c2.ticker IS NULL
          AND lower(trim(c2.nombre)) = 'caja gbm'
  );

-- 1.2b Si la Caja GBM ya existía (creada por la app), apagar sus predicciones.
--      Va a recibir decenas de aportaciones históricas y sin esto la app
--      detectaría una "recurrencia" y te sugeriría aportaciones fantasma.
UPDATE categorias
SET desactivar_prediccion = true
WHERE tipo = 'inversion'
  AND ticker IS NULL
  AND lower(trim(nombre)) = 'caja gbm'
  AND desactivar_prediccion IS DISTINCT FROM true;

-- 1.3 Crear la aportación que precede a cada compra histórica -----------------
--     Mismos pesos, los dólares exactos de la compra, un segundo antes.
INSERT INTO registros (
    categoria_id, monto, fecha, descripcion,
    costo_accion, tipo_cambio, cantidad_acciones,
    tipo_movimiento, monto_usd, user_id
)
SELECT
    caja.id,
    r.monto,                                        -- mismos pesos que salieron
    r.fecha - interval '1 second',                  -- se procesa antes que la compra
    'Aportación previa a ' || emp.nombre || ' [migrado]',
    0,
    ABS(r.monto) / (r.cantidad_acciones * r.costo_accion),   -- TC efectivo real
    0,
    'aportacion',
    r.cantidad_acciones * r.costo_accion,           -- dólares que consumirá la compra
    r.user_id
FROM registros r
JOIN categorias emp  ON emp.id = r.categoria_id
JOIN categorias caja ON caja.cuenta_id = emp.cuenta_id
                    AND caja.user_id   = emp.user_id
                    AND caja.tipo      = 'inversion'
                    AND caja.ticker IS NULL
                    AND lower(trim(caja.nombre)) = 'caja gbm'
WHERE r.tipo_movimiento IS NULL
  AND emp.tipo   = 'inversion'
  AND emp.ticker IS NOT NULL
  AND r.monto    < 0
  AND r.cantidad_acciones > 0
  AND r.costo_accion      > 0;

-- 1.4 Convertir la compra histórica en compra pagada con la caja --------------
--     El monto en pesos pasa a 0 porque esos pesos ya los lleva la aportación.
UPDATE registros r
SET tipo_movimiento = 'compra',
    monto_usd       = r.cantidad_acciones * r.costo_accion,
    monto           = 0,
    descripcion     = COALESCE(NULLIF(trim(r.descripcion), ''), 'Compra ' || emp.nombre) || ' [migrado]'
FROM categorias emp
WHERE emp.id = r.categoria_id
  AND r.tipo_movimiento IS NULL
  AND emp.tipo   = 'inversion'
  AND emp.ticker IS NOT NULL
  AND r.monto    < 0
  AND r.cantidad_acciones > 0
  AND r.costo_accion      > 0;

COMMIT;


-- =============================================================================
-- PASO 2 · VERIFICACIÓN POSTERIOR  (los totales deben coincidir con el PASO 0)
-- =============================================================================
-- 2.1 El dinero total que salió de cada cuenta no cambió:
SELECT
    cu.nombre                          AS cuenta,
    ROUND(SUM(b.monto)::numeric, 2)    AS pesos_antes,
    ROUND(SUM(r.monto)::numeric, 2)    AS pesos_despues,
    CASE WHEN ROUND(SUM(b.monto)::numeric, 2) = ROUND(SUM(r.monto)::numeric, 2)
         THEN '✅ CUADRA' ELSE '❌ REVISAR' END AS resultado
FROM cuentas cu
LEFT JOIN categorias c ON c.cuenta_id = cu.id
LEFT JOIN registros  r ON r.categoria_id = c.id
LEFT JOIN registros_backup_pre_caja_gbm b ON b.categoria_id = c.id
GROUP BY cu.nombre
ORDER BY cu.nombre;

-- 2.2 Cada compra migrada reconstruye su costo original al centavo:
SELECT
    emp.nombre                                            AS empresa,
    ROUND(ABS(b.monto)::numeric, 2)                       AS costo_original,
    ROUND((r.monto_usd * a.tipo_cambio)::numeric, 2)      AS costo_reconstruido,
    CASE WHEN ABS(ABS(b.monto) - r.monto_usd * a.tipo_cambio) < 0.01
         THEN '✅' ELSE '❌' END                           AS ok
FROM registros r
JOIN registros_backup_pre_caja_gbm b ON b.id = r.id
JOIN categorias emp ON emp.id = r.categoria_id
JOIN registros a    ON a.tipo_movimiento = 'aportacion'
                   AND a.fecha = r.fecha - interval '1 second'
                   AND a.user_id = r.user_id
WHERE r.tipo_movimiento = 'compra'
ORDER BY emp.nombre;


-- =============================================================================
-- PASO 3 · LISTAR LO MIGRADO  (todo lleva el sufijo "[migrado]")
-- =============================================================================
-- 3.1 Resumen: cuántos registros tocó la migración
SELECT
    CASE WHEN r.tipo_movimiento = 'aportacion' THEN 'Aportaciones creadas'
         ELSE 'Compras convertidas' END        AS tipo,
    COUNT(*)                                   AS cantidad
FROM registros r
WHERE r.descripcion LIKE '%[migrado]'
GROUP BY 1
ORDER BY 1;

-- 3.2 Detalle de cada registro migrado
SELECT
    r.fecha,
    c.nombre                          AS categoria,
    r.tipo_movimiento,
    ROUND(r.monto::numeric, 2)        AS pesos,
    ROUND(r.monto_usd::numeric, 2)    AS dolares,
    r.descripcion
FROM registros r
JOIN categorias c ON c.id = r.categoria_id
WHERE r.descripcion LIKE '%[migrado]'
ORDER BY r.fecha DESC;


-- =============================================================================
-- ROLLBACK · Solo si algo salió mal. Restaura el estado exacto previo.
-- =============================================================================
-- BEGIN;
--   DELETE FROM registros
--    WHERE id NOT IN (SELECT id FROM registros_backup_pre_caja_gbm);
--   UPDATE registros r
--      SET tipo_movimiento = b.tipo_movimiento,
--          monto           = b.monto,
--          monto_usd       = b.monto_usd,
--          descripcion     = b.descripcion
--     FROM registros_backup_pre_caja_gbm b
--    WHERE b.id = r.id;
-- COMMIT;
--
-- Para quitar solo las marcas "[migrado]" conservando la migración:
--   UPDATE registros
--      SET descripcion = NULLIF(trim(replace(descripcion, ' [migrado]', '')), '')
--    WHERE descripcion LIKE '%[migrado]';
-- =============================================================================
