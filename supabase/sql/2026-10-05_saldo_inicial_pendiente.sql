-- Una cuenta puede crearse sin saber cuánto tiene (el usuario nuevo lo deja para después):
-- su saldo inicial queda en 0 con esta marca, y el asistente lo enseña como pendiente
-- hasta que se ponga. Sólo agrega una columna (falso en las cuentas que ya existen); no
-- cambia ningún dato. Se puede correr varias veces.
ALTER TABLE cuentas
    ADD COLUMN IF NOT EXISTS saldo_inicial_pendiente boolean NOT NULL DEFAULT false;
