-- Sectores y subsectores propios de cada empresa (categorías de inversión con ticker), con su
-- clasificación GICS (la manual o de la IA del usuario, si no la del índice S&P). Sólo lectura.
SELECT left(c.user_id::text, 8) AS usuario, c.ticker, c.nombre, c.sectores, c.subsectores,
       coalesce(p.gics_sector, g.sector) AS gics_sector, coalesce(p.gics_subindustria, g.subindustria) AS gics_subindustria
FROM categorias c
LEFT JOIN perfiles_empresas p ON p.user_id = c.user_id AND upper(p.ticker) = upper(c.ticker)
LEFT JOIN gics_indices g ON upper(g.ticker) = upper(c.ticker)
WHERE c.tipo = 'inversion' AND c.ticker IS NOT NULL
ORDER BY 1, 2;
