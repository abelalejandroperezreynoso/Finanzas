-- Cada usuario puede guardar su propia clave de Finnhub en claves_proveedores. Finnhub sólo deja una
-- conexión en vivo por clave: con la misma en los dos teléfonos se sacaban uno al otro. Sólo cambia
-- qué proveedores acepta la tabla; no cambia datos existentes. Se puede correr varias veces.
ALTER TABLE claves_proveedores DROP CONSTRAINT IF EXISTS claves_proveedores_proveedor_check;
ALTER TABLE claves_proveedores ADD CONSTRAINT claves_proveedores_proveedor_check
    CHECK (proveedor IN ('twelvedata', 'alphavantage', 'finnhub'));
