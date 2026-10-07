-- Categorías de Salud: qué miden (descripción), cuántos registros, días con registro por mes
-- (últimos 4) y cómo se usa la cantidad. No devuelve las notas de cada registro. Sólo lectura.
SELECT left(c.user_id::text, 8) AS usuario, c.nombre, c.descripcion,
       count(r.id) AS registros, min(r.fecha)::date AS desde, max(r.fecha)::date AS hasta,
       count(DISTINCT (r.fecha AT TIME ZONE 'America/Mexico_City')::date) AS dias,
       round(avg(r.cantidad), 2) AS cantidad_promedio, min(r.cantidad) AS cantidad_min, max(r.cantidad) AS cantidad_max,
       count(r.id) FILTER (WHERE coalesce(r.descripcion, '') <> '') AS con_nota,
       (SELECT string_agg(m || ':' || n, ' ' ORDER BY m) FROM (
           SELECT to_char(r2.fecha AT TIME ZONE 'America/Mexico_City', 'YYYY-MM') AS m,
                  count(DISTINCT (r2.fecha AT TIME ZONE 'America/Mexico_City')::date) AS n
           FROM registros r2 WHERE r2.categoria_id = c.id
             AND r2.fecha > now() - interval '4 months' GROUP BY 1) x) AS dias_por_mes
FROM categorias c LEFT JOIN registros r ON r.categoria_id = c.id
WHERE c.tipo = 'salud'
GROUP BY c.id, 1, 2, 3
ORDER BY 1, 4 DESC;
