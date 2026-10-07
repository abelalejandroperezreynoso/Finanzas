-- Préstamos (te deben) por usuario: cuánto queda pendiente, el último cobro y si hubo cobro este
-- mes, más las categorías de ingreso cuyo nombre habla de intereses. Sólo lectura.
SELECT left(c.user_id::text, 8) AS usuario, c.tipo, c.nombre, cu.nombre AS cuenta, cu.incluir_en_total,
       round(-sum(r.monto), 2) AS pendiente,
       max(r.fecha) FILTER (WHERE r.monto > 0)::date AS ultimo_cobro,
       bool_or(r.monto > 0 AND date_trunc('month', r.fecha AT TIME ZONE 'America/Mexico_City') = date_trunc('month', now() AT TIME ZONE 'America/Mexico_City')) AS cobro_este_mes
FROM categorias c JOIN cuentas cu ON cu.id = c.cuenta_id LEFT JOIN registros r ON r.categoria_id = c.id
WHERE c.tipo = 'prestamo' OR (c.tipo = 'ingreso' AND c.nombre ILIKE '%inter%')
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2, 3;
