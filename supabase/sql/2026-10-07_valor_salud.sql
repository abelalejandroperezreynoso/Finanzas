-- Salud: una cuarta medida, 'valor', para lo que se mide con aparato y tiene su propia unidad
-- (fiebre en °C, glucosa en mg/dL, peso en kg, oxigenación en %, pulso en lpm). Se promedia y se
-- ven su mínimo y su máximo; la unidad la escribe el usuario en unidad_salud.
-- Sólo amplía la regla de medida_salud y agrega una columna; no cambia datos. Se puede correr
-- varias veces.

ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_medida_salud_check;
ALTER TABLE categorias ADD CONSTRAINT categorias_medida_salud_check
    CHECK (medida_salud IN ('intensidad', 'veces', 'horas', 'valor'));

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS unidad_salud text
    CHECK (char_length(unidad_salud) <= 12);
