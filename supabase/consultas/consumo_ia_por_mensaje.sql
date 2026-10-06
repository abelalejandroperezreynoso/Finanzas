-- Cuánto cuesta cada mensaje a la IA en los últimos 14 días, por función y modelo: promedio
-- de tokens (y cuánto salió de la caché), costo promedio, máximo y total. Sólo lectura.
-- Se corre a mano desde "Ejecutar SQL en Supabase" con una clave pública: el resultado
-- sale cifrado en el registro.
SELECT funcion, modelo,
       count(*) AS mensajes,
       round(avg(tokens_entrada)) AS entrada_prom,
       round(avg(tokens_cache_lectura)) AS cache_lectura_prom,
       round(avg(tokens_cache_escritura)) AS cache_escritura_prom,
       round(100 * sum(tokens_cache_lectura)::numeric / nullif(sum(tokens_entrada), 0), 1) AS pct_de_cache,
       round(avg(tokens_salida)) AS salida_prom,
       round(avg(costo_usd)::numeric, 5) AS usd_prom,
       round(max(costo_usd)::numeric, 5) AS usd_max,
       round(sum(costo_usd)::numeric, 4) AS usd_total
FROM uso_ia
WHERE creado_en > now() - interval '14 days'
GROUP BY 1, 2
ORDER BY usd_total DESC NULLS LAST;
