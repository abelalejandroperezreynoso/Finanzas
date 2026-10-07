-- Por qué el asistente y la app pueden decir saldos totales distintos: por usuario y cuenta,
-- el saldo inicial, lo que suman los movimientos y lo que devuelve saldos_cuentas (lo que usan
-- la app y el asistente). También la definición de saldos_cuentas. Sólo lectura.
WITH movs AS (
  SELECT c.cuenta_id, sum(r.monto) FILTER (WHERE coalesce(c.tipo, '') <> 'salud') AS suma_movs,
         sum(r.monto) FILTER (WHERE c.tipo = 'inversion') AS suma_inversion, count(*) AS n
  FROM registros r JOIN categorias c ON c.id = r.categoria_id
  GROUP BY c.cuenta_id
)
SELECT 'cuenta' AS fila, cu.user_id::text AS usuario, cu.nombre, cu.incluir_en_total,
       cu.saldo_inicial, m.suma_movs, m.suma_inversion, m.n,
       (SELECT s.balance FROM saldos_cuentas(cu.user_id) s WHERE s.id_cuenta = cu.id) AS balance_rpc
FROM cuentas cu LEFT JOIN movs m ON m.cuenta_id = cu.id
UNION ALL
SELECT 'definicion', NULL, p.proname, NULL, NULL, NULL, NULL, NULL, NULL
FROM pg_proc p WHERE p.proname = 'saldos_cuentas'
UNION ALL
SELECT 'cuerpo', NULL, pg_get_functiondef(p.oid), NULL, NULL, NULL, NULL, NULL, NULL
FROM pg_proc p WHERE p.proname = 'saldos_cuentas'
ORDER BY 1, 2, 3;
