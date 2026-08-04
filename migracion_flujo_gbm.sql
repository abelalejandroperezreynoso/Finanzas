-- =============================================================
-- Migración: Flujo GBM (caja USD en Trading USA)
-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run
-- =============================================================
-- Agrega a `registros` los campos del flujo de inversión GBM:
--
--   tipo_movimiento: clasifica el movimiento de una categoría de inversión.
--     'aportacion' → Smart Cash → Trading USA (salen MXN, entran USD a la caja)
--     'compra'     → se compran acciones con USD de la caja (monto MXN = 0)
--     'venta'      → se venden acciones y los USD quedan en la caja (monto MXN = 0)
--     'retiro'     → Trading USA → Smart Cash (salen USD, regresan MXN)
--     NULL         → movimiento "directo" histórico (pesos ↔ acciones en un paso)
--                    o movimiento de una categoría que no es de inversión.
--
--   monto_usd: importe del movimiento en dólares (siempre positivo).
--
-- Los registros existentes no necesitan migrarse: con tipo_movimiento NULL
-- la aplicación los sigue interpretando por el signo del monto, igual que antes.

ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS tipo_movimiento text
        CHECK (tipo_movimiento IN ('aportacion', 'compra', 'venta', 'retiro')),
    ADD COLUMN IF NOT EXISTS monto_usd numeric NOT NULL DEFAULT 0;
