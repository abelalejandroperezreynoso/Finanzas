-- La función asistente anota aparte los tokens que salieron de la caché de Anthropic
-- (lectura al 10 % del precio) y los que se escribieron en ella, para ver si la caché
-- está funcionando. Sólo agrega columnas; no cambia datos. Se puede correr varias veces.
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_cache_lectura   integer;
ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS tokens_cache_escritura integer;
