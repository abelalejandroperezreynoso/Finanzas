-- Cuándo reporta cada empresa (trimestral y anual), en su perfil.
--
-- perfiles_empresas.proximos_reportes: lo llena la función asistente (modo pesos, una vez al día al abrir la app)
-- con la agenda de resultados de Finnhub, cada semana o en cuanto pasa el reporte que venía:
--   { "revisado": "2026-10-27",
--     "lista": [{ "fecha": "2026-11-02", "trimestre": 4, "anio": 2026 }, ...],   -- trimestre y año fiscales
--     "anual": { "fecha": "2026-11-02", "estimado": false } }                    -- el del 4º trimestre
--
-- Sólo agrega una columna; no cambia datos. Se puede correr varias veces.

ALTER TABLE public.perfiles_empresas ADD COLUMN IF NOT EXISTS proximos_reportes jsonb;
