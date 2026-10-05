-- Con qué signo se guardan los movimientos de inversión, por tipo. Sólo cuenta signos;
-- no devuelve montos ni descripciones. Sólo lectura.
SELECT r.tipo_movimiento, c.nombre = 'Caja GBM' AS en_caja, sign(r.monto) AS signo_pesos,
       sign(r.monto_usd) AS signo_usd, sign(r.cantidad_acciones) AS signo_acciones, count(*) AS movimientos
FROM registros r JOIN categorias c ON c.id = r.categoria_id
WHERE c.tipo = 'inversion'
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2, 3, 4, 5;
