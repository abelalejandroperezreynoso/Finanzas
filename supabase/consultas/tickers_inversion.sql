-- Tickers de las categorías de inversión de cada usuario, tal como están escritos. Sólo lectura.
SELECT left(user_id::text, 8) AS usuario, string_agg(DISTINCT '[' || ticker || ']', ' ' ORDER BY '[' || ticker || ']') AS tickers
FROM categorias
WHERE tipo = 'inversion' AND ticker IS NOT NULL AND ticker <> ''
GROUP BY 1
ORDER BY 1;
