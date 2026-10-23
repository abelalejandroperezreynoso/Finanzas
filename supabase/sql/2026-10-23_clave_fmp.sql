-- La clave de Financial Modeling Prep (ventas por segmento) también se guarda en claves_proveedores,
-- desde Ajustes → Proveedores. La función asistente la usa si no hay secreto FMP_API_KEY.
-- Sólo cambia qué proveedores acepta la tabla; no cambia datos existentes. Se puede correr varias veces.
ALTER TABLE claves_proveedores DROP CONSTRAINT IF EXISTS claves_proveedores_proveedor_check;
ALTER TABLE claves_proveedores ADD CONSTRAINT claves_proveedores_proveedor_check
    CHECK (proveedor IN ('twelvedata', 'alphavantage', 'finnhub', 'fmp'));
