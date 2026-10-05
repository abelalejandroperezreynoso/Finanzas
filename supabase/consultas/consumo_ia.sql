-- Consumo de la IA de los últimos 14 días, por día, función y modelo. Sólo lectura.
-- Se corre a mano desde "Ejecutar SQL en Supabase" con una clave pública: el resultado
-- sale cifrado en el registro.
SELECT date_trunc('day', creado_en)::date AS dia, funcion, modelo,
       count(*) AS consultas,
       sum(tokens_entrada) AS entrada, sum(tokens_cache_lectura) AS cache_lectura,
       sum(tokens_cache_escritura) AS cache_escritura,
       sum(tokens_salida) AS salida, round(sum(costo_usd)::numeric, 4) AS usd
FROM uso_ia
WHERE creado_en > now() - interval '14 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, usd DESC;
