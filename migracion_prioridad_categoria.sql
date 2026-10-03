-- =============================================================
-- Migración: prioridad de las categorías de gasto (técnica de las 4 "N")
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
-- =============================================================
-- Cada categoría de gasto puede llevar uno de cuatro niveles, de mayor a
-- menor prioridad:
--
--   vital         Necesidad vital (sobrevivencia): indispensables para vivir,
--                 mantener tu vivienda o tu capacidad de generar ingresos.
--   operativa     Necesidad operativa (obligaciones): compromisos financieros
--                 que debes cumplir para mantener la estabilidad a largo plazo.
--   util          No necesario pero útil (comodidad): optimizan tiempo, confort
--                 o productividad, pero podrías prescindir si es necesario.
--   prescindible  Prescindible / deseo (estilo de vida): puramente opcionales,
--                 entretenimiento, ocio o caprichos.
--
--   NULL = sin asignar (y siempre en las categorías que no son de gasto).
--
-- Todo el script usa IF NOT EXISTS, no toca ningún dato y se puede ejecutar
-- las veces que quieras.
-- =============================================================

ALTER TABLE public.categorias
    ADD COLUMN IF NOT EXISTS prioridad text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'categorias_prioridad_valida'
    ) THEN
        ALTER TABLE public.categorias
            ADD CONSTRAINT categorias_prioridad_valida
            CHECK (prioridad IS NULL OR prioridad IN ('vital', 'operativa', 'util', 'prescindible'));
    END IF;
END $$;

COMMENT ON COLUMN public.categorias.prioridad IS
    'Prioridad del gasto (4 N): vital, operativa, util, prescindible. NULL = sin asignar.';

-- Comprobación: recién hecha la migración, la última columna sale en cero.
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'categorias'
        AND column_name = 'prioridad')                                   AS columna_lista,
    (SELECT count(*) FROM public.categorias WHERE prioridad IS NOT NULL) AS con_prioridad;

-- Para deshacerlo (se pierden las prioridades asignadas, nada más):
--   ALTER TABLE public.categorias DROP COLUMN IF EXISTS prioridad;
