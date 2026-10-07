-- Salud: qué mide la cantidad de cada categoría y a qué grupo pertenece. Antes la cantidad podía ser
-- la intensidad de un dolor, cuántas veces pasó algo o cuántas horas se durmió, y sólo la
-- descripción lo decía: la app sumaba intensidades y la IA las leía como pastillas.
--
--   medida_salud  'intensidad' (1 a 10: se promedia), 'veces' (se suma) u 'horas' (por día)
--   grupo_salud   'enfermedad' (un síntoma o padecimiento: menos es mejor) o 'habito'
--
-- NULL = sin definir; las categorías que ya existen quedan así hasta que el usuario o la IA (con su
-- confirmación) les ponga medida y grupo. Sólo agrega columnas; no cambia datos. Se puede correr
-- varias veces.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS medida_salud text
    CHECK (medida_salud IN ('intensidad', 'veces', 'horas'));
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS grupo_salud text
    CHECK (grupo_salud IN ('enfermedad', 'habito'));
