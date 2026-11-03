-- Tipo de la columna registros.fecha y cómo vienen las fechas de las compras y ventas de acciones
-- de los últimos 3 días (sólo ticker, fecha, acciones y precio). Sólo lectura.
SELECT 'tipo' AS que, data_type AS valor, NULL AS ticker, NULL::numeric AS acciones, NULL::numeric AS precio
FROM information_schema.columns WHERE table_name = 'registros' AND column_name = 'fecha'
UNION ALL
SELECT 'compra', r.fecha::text || ' | ' || to_json(r.fecha)::text, c.ticker, r.cantidad_acciones, r.costo_accion
FROM registros r JOIN categorias c ON c.id = r.categoria_id
WHERE c.tipo = 'inversion' AND r.cantidad_acciones > 0 AND r.fecha > now() - interval '3 days';
