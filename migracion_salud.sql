-- ============================================================================
-- SALUD: categorías y registros que no son dinero
-- ============================================================================
--
-- Una categoría de tipo 'salud' lleva la cuenta de algo que no se mide en pesos:
-- cuántas veces apareció un síntoma, litros de agua, horas de sueño... Cada registro
-- guarda esa cantidad en la columna nueva `cantidad` y deja el monto en 0, de modo
-- que ningún saldo, gráfica ni resumen de dinero cambia por ellos.
--
-- Qué hace:
--   1. Añade registros.cantidad (numérica, opcional).
--   2. Permite el tipo 'salud' en categorias.tipo, sea la columna texto con una
--      restricción CHECK o un tipo enumerado.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS cantidad numeric;

DO $$
DECLARE
    tipo_columna text;
    nombre_udt   text;
    restriccion  record;
BEGIN
    SELECT data_type, udt_name INTO tipo_columna, nombre_udt
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categorias' AND column_name = 'tipo';

    IF tipo_columna = 'USER-DEFINED' THEN
        -- La columna es un enum: basta con añadirle el valor
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', nombre_udt, 'salud');
    ELSE
        -- Texto: se quitan las restricciones CHECK que limitan el tipo y se pone una
        -- que ya incluye 'salud'
        FOR restriccion IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public'
              AND rel.relname = 'categorias'
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
        LOOP
            EXECUTE format('ALTER TABLE categorias DROP CONSTRAINT %I', restriccion.conname);
        END LOOP;

        ALTER TABLE categorias
            ADD CONSTRAINT categorias_tipo_check
            CHECK (tipo IN ('gasto', 'ingreso', 'prestamo', 'deuda', 'inversion', 'salud')) NOT VALID;
    END IF;
END $$;

-- Comprobación: debe salir la columna cantidad y la restricción (o el enum) con 'salud'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'registros' AND column_name = 'cantidad';
