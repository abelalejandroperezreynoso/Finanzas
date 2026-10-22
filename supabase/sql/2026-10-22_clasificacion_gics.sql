-- Clasificación GICS de las empresas (sector y subindustria), la misma del mapa del S&P 500.
--
-- gics_indices: la lista pública del S&P 500, 400 y 600. Es igual para todos: la llena cada
-- semana el flujo actualizar-gics.yml y la app sólo la lee.
--
-- perfiles_empresas.gics_*: la clasificación propia de cada usuario para una empresa. La pone
-- la IA para lo que no está en los índices (origen 'ia') o el usuario, a mano o confirmando lo
-- que propone el asistente (origen 'manual'). Lo manual manda sobre el índice.
--
-- Sólo agrega una tabla y columnas; no cambia datos. Se puede correr varias veces.

CREATE TABLE IF NOT EXISTS public.gics_indices (
    ticker         text PRIMARY KEY,
    sector         text NOT NULL,
    subindustria   text NOT NULL,
    indice         text NOT NULL,
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gics_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gics_indices_leer ON public.gics_indices;
CREATE POLICY gics_indices_leer ON public.gics_indices
    FOR SELECT TO authenticated USING (true);

ALTER TABLE public.perfiles_empresas ADD COLUMN IF NOT EXISTS gics_sector text;
ALTER TABLE public.perfiles_empresas ADD COLUMN IF NOT EXISTS gics_subindustria text;
ALTER TABLE public.perfiles_empresas ADD COLUMN IF NOT EXISTS gics_origen text;

ALTER TABLE public.perfiles_empresas DROP CONSTRAINT IF EXISTS perfiles_empresas_gics_origen_check;
ALTER TABLE public.perfiles_empresas ADD CONSTRAINT perfiles_empresas_gics_origen_check
    CHECK (gics_origen IS NULL OR gics_origen IN ('ia', 'manual'));
