-- Categorías de las cuentas que no suman al total (donde viven las de Salud): nombre, tipo, grupo y
-- medida de Salud y cuántos registros tienen. No devuelve registros. Sólo lectura.
SELECT left(c.user_id::text, 8) AS usuario, cu.nombre AS cuenta, c.nombre, c.tipo, c.grupo_salud, c.medida_salud,
       count(r.id) AS registros, max(r.fecha)::date AS ultimo
FROM categorias c JOIN cuentas cu ON cu.id = c.cuenta_id LEFT JOIN registros r ON r.categoria_id = c.id
WHERE cu.incluir_en_total = false OR c.tipo = 'salud' OR c.nombre ILIKE '%agua%'
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3;
