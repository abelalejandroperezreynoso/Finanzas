-- Comisiones de GBM como movimiento propio de la Caja GBM.
--
-- La app guarda en cada compra o venta el precio puro de las acciones (títulos × precio) y la
-- comisión quedaba fuera: la caja de la app se iba quedando con unos centavos de más en cada
-- orden. Ahora la comisión se registra aparte, con tipo_movimiento = 'comision': monto 0 (no mueve
-- pesos) y monto_usd = lo que GBM cobró, que sale de la caja.
--
-- Sólo cambia la regla de valores permitidos; no toca ningún registro. Se puede correr varias veces.

DO $$
DECLARE
    regla record;
BEGIN
    FOR regla IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.registros'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%tipo_movimiento%'
    LOOP
        EXECUTE format('ALTER TABLE public.registros DROP CONSTRAINT %I', regla.conname);
    END LOOP;
END $$;

ALTER TABLE public.registros
    ADD CONSTRAINT registros_tipo_movimiento_check
    CHECK (tipo_movimiento IS NULL OR tipo_movimiento IN ('aportacion', 'compra', 'venta', 'retiro', 'comision'));
