-- Descripción de las cuentas, como la de las categorías: qué es la cuenta en palabras
-- del usuario (por ejemplo "Tarjeta de nómina BBVA" o "Dinero de Rocío, no es mío").
-- La IA la lee para entender mejor los movimientos. Sólo añade una columna opcional;
-- no cambia ningún dato. Se puede correr varias veces.
ALTER TABLE cuentas
    ADD COLUMN IF NOT EXISTS descripcion text;
