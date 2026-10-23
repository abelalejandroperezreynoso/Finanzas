-- Porcentajes de los sectores y subsectores propios de cada empresa. Sin ellos, el mapa reparte
-- la empresa en partes iguales. Formato:
--   { "origen": "segmentos" | "manual",
--     "pesos": { "Tecnología › Publicidad": 82.3, "Tecnología › Cloud": 17.7 },
--     "receta": { "Google Cloud": "Tecnología › Cloud", "Other Bets": "" },   -- sólo con segmentos
--     "anio": 2025, "cierre": "2025-12-31", "ignorados": [...],
--     "actualizado": "2026-10-23", "revisado": "2026-10-23", "error": null }
-- Con receta, la función asistente (modo "pesos") los recalcula con cada reporte anual de FMP.
-- Sólo agrega la columna: no toca datos.

ALTER TABLE public.categorias
    ADD COLUMN IF NOT EXISTS pesos_subsectores jsonb;

COMMENT ON COLUMN public.categorias.pesos_subsectores IS
    'Porcentajes de los sectores/subsectores propios (origen segmentos o manual, con su receta y periodo). NULL = partes iguales.';
