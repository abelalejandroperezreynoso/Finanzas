-- Claves de los proveedores de precios (Twelve Data, Alpha Vantage) de cada usuario, para que se
-- vean en cualquier teléfono donde entre. Antes vivían sólo en el teléfono y se perdían al
-- reinstalar la app. Cada usuario ve, guarda y borra sólo las suyas. Sólo crea una tabla nueva; no
-- cambia datos existentes. Se puede correr varias veces.

CREATE TABLE IF NOT EXISTS claves_proveedores (
    user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    proveedor      text NOT NULL CHECK (proveedor IN ('twelvedata', 'alphavantage')),
    clave          text NOT NULL CHECK (char_length(clave) BETWEEN 1 AND 200),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, proveedor)
);
ALTER TABLE claves_proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claves_proveedores ver lo propio" ON claves_proveedores;
CREATE POLICY "claves_proveedores ver lo propio" ON claves_proveedores
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "claves_proveedores anotar lo propio" ON claves_proveedores;
CREATE POLICY "claves_proveedores anotar lo propio" ON claves_proveedores
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "claves_proveedores cambiar lo propio" ON claves_proveedores;
CREATE POLICY "claves_proveedores cambiar lo propio" ON claves_proveedores
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "claves_proveedores borrar lo propio" ON claves_proveedores;
CREATE POLICY "claves_proveedores borrar lo propio" ON claves_proveedores
    FOR DELETE TO authenticated USING (user_id = auth.uid());
